import { AIMessage, type BaseMessage, type ToolCall, ToolMessage } from "@langchain/core/messages";
import {
  Annotation,
  type BaseCheckpointSaver,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
  getConfig,
  task,
} from "@langchain/langgraph";
import { type HookPlan, agentPlan, toolPlan } from "../hooks/plan";
import {
  bindModelTools,
  buildModel,
  buildResponsesInstructions,
  modelMessages,
  resolveModelApi,
} from "./model";
import { hookNode, modelNode, toolsNode } from "../hooks/graph/commands";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BunSqliteSaver } from "../checkpointer";
import type { Database } from "bun:sqlite";
import type { HookRuntime } from "../hooks/runtime";
import type { HookToolOutput } from "../hooks/storage/outputs";
import { ModelEmptyResponseError } from "../runtime/network";
import type { Settings } from "../types";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ToolExecutions } from "./toolExecutions";
import { buildSkillsMessage } from "../skills";
import { contentToText } from "../runtime/content";
import { createHookNode } from "../hooks/graph/node";
import { createToolInvoker } from "./toolExecution";
import { normalizeTaskConfig } from "./taskConfig";
import { randomUUID } from "node:crypto";
const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  hookPendingUserIds: Annotation<string[]>({
    default: () => [],
    reducer: (_left, right) => right,
  }),
  hookPlan: Annotation<HookPlan | null>({
    default: () => null,
    reducer: (_left, right) => right,
  }),
  hookPreviousOutput: Annotation<HookToolOutput | undefined>({
    default: () => undefined,
    reducer: (_left, right) => right,
  }),
});
type GraphState = typeof AgentState.State;
interface AgentGraphOptions {
  settings: Settings;
  model: BaseChatModel;
  tools: StructuredToolInterface[];
  modelTools?: StructuredToolInterface[];
  freeformToolParameters?: ReadonlyMap<string, string>;
  toolExecutions?: ToolExecutions;
  hooks: HookRuntime;
  checkpointer?: BaseCheckpointSaver;
  skillsMessage?: string | null;
}
export function buildGraph(
  settings: Settings,
  tools: StructuredToolInterface[],
  database: Database,
  hooks: HookRuntime,
  toolOptions: Pick<
    AgentGraphOptions,
    "modelTools" | "freeformToolParameters" | "toolExecutions"
  > = {},
) {
  const checkpointer = new BunSqliteSaver(database, hooks.sessionId);
  const skillsMessage = buildSkillsMessage(settings);
  const instructions = buildResponsesInstructions(settings.agent.systemPrompt, skillsMessage);
  const model = buildModel(
    settings,
    hooks.sessionId,
    resolveModelApi(settings.model) === "responses" ? instructions : undefined,
  );
  const graph = createAgentGraph({
    settings,
    model,
    tools,
    ...toolOptions,
    hooks,
    checkpointer,
    skillsMessage,
  });
  return { checkpointer, graph };
}
export function createAgentGraph(options: AgentGraphOptions) {
  const model = bindModelTools(options.model, options.modelTools ?? options.tools);
  const invokeTool = createToolInvoker(options.tools, {
    freeformToolParameters: options.freeformToolParameters ?? new Map(),
    sessionId: options.hooks.sessionId,
    settings: options.settings,
    toolExecutions: options.toolExecutions,
  });
  const requestModel = task("request_model", async (messages: BaseMessage[]) => {
    const response = await model.invoke(messages, normalizeTaskConfig(getConfig()));
    if (!AIMessage.isInstance(response)) {
      throw new Error("没有返回 AIMessage");
    }
    if (!response.tool_calls?.length && !contentToText(response.content)) {
      throw new ModelEmptyResponseError();
    }
    response.id ??= randomUUID();
    return response as AIMessage & { id: string };
  });
  const runTool = task(
    "invoke_tool",
    async (call: ToolCall): Promise<ToolMessage> =>
      invokeTool(call, normalizeTaskConfig(getConfig())),
  ) as unknown as (call: ToolCall) => Promise<ToolMessage>;
  const consumeHookTask = task("consume_hook_usage", (hookId: string, limit: number) => ({
    consumed: options.hooks.consume(hookId, limit),
  }));
  const consumeHook = async (hookId: string, limit: number) =>
    (await consumeHookTask(hookId, limit)).consumed;
  const runHooks = createHookNode(options.hooks, consumeHook, runTool);
  const callModel = async (state: GraphState) => {
    const response = await requestModel(
      modelMessages(options.settings, options.skillsMessage, state.messages),
    );
    return {
      hookPlan: response.tool_calls?.length
        ? toolPlan(response)
        : agentPlan("after", [response.id], state.hookPreviousOutput),
      messages: [response],
    };
  };
  const callTool = async (state: GraphState) => {
    const call = pendingToolCall(state.messages);
    return { messages: [await runTool(call)] };
  };
  return new StateGraph(AgentState)
    .addNode(hookNode, runHooks, {
      ends: [hookNode, modelNode, toolsNode, END],
    })
    .addNode(modelNode, callModel)
    .addNode(toolsNode, callTool)
    .addEdge(START, hookNode)
    .addEdge(modelNode, hookNode)
    .addEdge(toolsNode, hookNode)
    .compile({ checkpointer: options.checkpointer });
}
function pendingToolCall(messages: BaseMessage[]): ToolCall {
  const completed = new Set(
    messages
      .filter((message) => ToolMessage.isInstance(message))
      .map((message) => message.tool_call_id),
  );
  const call = messages
    .findLast((message) => AIMessage.isInstance(message))
    ?.tool_calls?.find((candidate) => !candidate.id || !completed.has(candidate.id));
  if (!call) {
    throw new Error("工具节点没有待执行的工具调用");
  }
  return call;
}

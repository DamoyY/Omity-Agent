import { randomUUID } from "node:crypto";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
  type ToolCall,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { Database } from "bun:sqlite";
import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
  type BaseCheckpointSaver,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { BunSqliteSaver } from "../checkpointer";
import { hookNode, modelNode, toolsNode } from "../hooks/graph/commands";
import { createHookNode, requireThreadId } from "../hooks/graph/node";
import {
  agentPlan,
  requireCallId,
  toolPlan,
  type HookPlan,
} from "../hooks/plan";
import type { HookRuntime } from "../hooks/runtime";
import { buildSkillsMessage } from "../skills";
import type { Settings } from "../types";
import {
  bindModelTools,
  buildModel,
  buildResponsesInstructions,
  modelMessages,
} from "./model";
import { createToolInvoker } from "./toolExecution";

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  hookPendingUserIds: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  hookPlan: Annotation<HookPlan | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  hookPreviousInvocationKey: Annotation<string | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
});

type GraphState = typeof AgentState.State;

interface AgentGraphOptions {
  settings: Settings;
  model: BaseChatModel;
  tools: StructuredToolInterface[];
  modelTools?: StructuredToolInterface[];
  freeformToolParameters?: ReadonlyMap<string, string>;
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
    "modelTools" | "freeformToolParameters"
  > = {},
) {
  const checkpointer = new BunSqliteSaver(database, hooks.sessionId);
  const skillsMessage = buildSkillsMessage(settings);
  const instructions = buildResponsesInstructions(
    settings.agent.systemPrompt,
    skillsMessage,
  );
  const model = buildModel(
    settings,
    settings.model.api === "responses" ? instructions : undefined,
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
  return { graph, checkpointer };
}

export function createAgentGraph(options: AgentGraphOptions) {
  const model = bindModelTools(
    options.model,
    options.modelTools ?? options.tools,
  );
  const invokeTool = createToolInvoker(options.tools, {
    settings: options.settings,
    sessionId: options.hooks.sessionId,
    freeformToolParameters: options.freeformToolParameters ?? new Map(),
  });
  const runHooks = createHookNode(options.hooks, invokeTool);

  const callModel = async (
    state: GraphState,
    config: LangGraphRunnableConfig,
  ) => {
    const response = await model.invoke(
      modelMessages(options.settings, options.skillsMessage, state.messages),
      config,
    );
    if (!AIMessage.isInstance(response))
      throw new Error("模型没有返回 AIMessage");
    response.id ??= randomUUID();
    return {
      messages: [response],
      hookPlan: response.tool_calls?.length
        ? toolPlan(response)
        : agentPlan("after", [response.id], state.hookPreviousInvocationKey),
    };
  };

  const callTool = async (
    state: GraphState,
    config: LangGraphRunnableConfig,
  ) => {
    const call = pendingToolCall(state.messages);
    const output = await options.hooks.runAgentTool(
      call.name,
      requireCallId(call),
      requireThreadId(config.configurable),
      () => invokeTool(call, state, config),
    );
    return { messages: [output] };
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
    ?.tool_calls?.find(
      (candidate) => !candidate.id || !completed.has(candidate.id),
    );
  if (!call) throw new Error("工具节点没有待执行的工具调用");
  return call;
}

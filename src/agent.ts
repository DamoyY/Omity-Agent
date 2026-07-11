import { ChatOpenAICompletions } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { createAgent, createMiddleware } from "langchain";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { BunSqliteSaver } from "./checkpointer";
import { createLargeToolOutputMiddleware } from "./runtime/largeOutput";
import { buildSkillsMessage } from "./skills";
import type { Settings } from "./types";
import { createHookMiddleware } from "./hooks/middleware";
import type { HookRuntime } from "./hooks/runtime";
import { CompatibleChatOpenAIResponses } from "./infrastructure/responses";
export {
  normalizeResponsesPayload,
  normalizeResponsesStreamEvent,
} from "./infrastructure/responses";

export function buildModel(settings: Settings, instructions?: string) {
  const apiKey = process.env[settings.model.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`缺少环境变量 ${settings.model.apiKeyEnv}`);
  }
  const fields = {
    model: settings.model.model,
    apiKey,
    maxRetries: settings.model.maxRetries,
    timeout: settings.model.timeoutMs,
    streaming: true,
    configuration: settings.model.baseURL
      ? { baseURL: settings.model.baseURL }
      : undefined,
    ...(settings.model.temperature === undefined
      ? {}
      : { temperature: settings.model.temperature }),
    ...(settings.model.reasoning_effort === undefined
      ? {}
      : { reasoning: { effort: settings.model.reasoning_effort } }),
  };
  if (settings.model.api === "responses") {
    return new CompatibleChatOpenAIResponses({
      ...fields,
      ...(instructions ? { modelKwargs: { instructions } } : {}),
    });
  }
  return new ChatOpenAICompletions(fields);
}

export function buildGraph(
  settings: Settings,
  tools: StructuredToolInterface[],
  checkpointPath: string,
  hooks: HookRuntime,
) {
  const checkpointer = new BunSqliteSaver(checkpointPath);
  const skillsMessage = buildSkillsMessage(settings);
  const responseInstructions = buildResponsesInstructions(
    settings.agent.systemPrompt,
    skillsMessage,
  );
  const usesResponsesInstructions = settings.model.api === "responses";
  const middleware = [
    createHookMiddleware(hooks),
    createLargeToolOutputMiddleware(settings),
    ...(skillsMessage && !usesResponsesInstructions
      ? [createSkillsMiddleware(skillsMessage)]
      : []),
  ] as const;
  const graph = createAgent({
    model: buildModel(
      settings,
      usesResponsesInstructions ? responseInstructions : undefined,
    ),
    tools,
    ...(usesResponsesInstructions
      ? {}
      : { systemPrompt: settings.agent.systemPrompt }),
    middleware,
    checkpointer,
    version: "v1",
  });
  return { graph, checkpointer };
}

export function buildResponsesInstructions(
  systemPrompt: string,
  skillsMessage: string | null | undefined,
) {
  return [systemPrompt, skillsMessage].filter(Boolean).join("\n\n");
}

export function createSkillsMiddleware(skillsMessage: string) {
  return createMiddleware({
    name: "skills",
    wrapModelCall: (request, handler) =>
      handler({
        ...request,
        messages: [new SystemMessage(skillsMessage), ...request.messages],
      }),
  });
}

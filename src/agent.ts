import { ChatOpenAICompletions, ChatOpenAIResponses } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { createAgent, createMiddleware } from "langchain";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { BunSqliteSaver } from "./checkpointer";
import { buildSkillsMessage } from "./skills";
import type { Settings } from "./types";

export function buildModel(settings: Settings) {
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
  };
  if (settings.model.api === "responses") {
    return new ChatOpenAIResponses(fields);
  }
  return new ChatOpenAICompletions(fields);
}

export function buildGraph(
  settings: Settings,
  tools: StructuredToolInterface[],
  checkpointPath: string,
) {
  const checkpointer = new BunSqliteSaver(checkpointPath);
  const skillsMessage = buildSkillsMessage(settings);
  const graph = createAgent({
    model: buildModel(settings),
    tools,
    systemPrompt: settings.agent.systemPrompt,
    middleware: skillsMessage ? [createSkillsMiddleware(skillsMessage)] : [],
    checkpointer,
  });
  return { graph, checkpointer };
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

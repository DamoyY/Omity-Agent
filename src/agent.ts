import { ChatOpenAICompletions, ChatOpenAIResponses } from "@langchain/openai";
import { createAgent } from "langchain";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { Settings } from "./types";

export function buildModel(settings: Settings) {
  const apiKey = process.env[settings.model.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`缺少环境变量 ${settings.model.apiKeyEnv}`);
  }
  const fields = {
    model: settings.model.model,
    apiKey,
    temperature: settings.model.temperature,
    maxRetries: settings.model.maxRetries,
    timeout: settings.model.timeoutMs,
    streaming: true,
    configuration: settings.model.baseURL
      ? { baseURL: settings.model.baseURL }
      : undefined,
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
  const checkpointer = SqliteSaver.fromConnString(checkpointPath);
  const graph = createAgent({
    model: buildModel(settings),
    tools,
    systemPrompt: settings.agent.systemPrompt,
    checkpointer,
  });
  return { graph, checkpointer };
}

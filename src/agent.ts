import { ChatOpenAICompletions, ChatOpenAIResponses } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { createAgent, createMiddleware } from "langchain";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { OpenAI } from "openai";
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
    ...(settings.model.reasoning_effort === undefined
      ? {}
      : { reasoning: { effort: settings.model.reasoning_effort } }),
  };
  if (settings.model.api === "responses") {
    return new CompatibleChatOpenAIResponses(fields);
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

class CompatibleChatOpenAIResponses extends ChatOpenAIResponses {
  override completionWithRetry(
    request: OpenAI.Responses.ResponseCreateParamsStreaming,
    requestOptions?: OpenAI.RequestOptions,
  ): Promise<AsyncIterable<OpenAI.Responses.ResponseStreamEvent>>;
  override completionWithRetry(
    request: OpenAI.Responses.ResponseCreateParamsNonStreaming,
    requestOptions?: OpenAI.RequestOptions,
  ): Promise<OpenAI.Responses.Response>;
  override async completionWithRetry(
    request:
      | OpenAI.Responses.ResponseCreateParamsStreaming
      | OpenAI.Responses.ResponseCreateParamsNonStreaming,
    requestOptions?: OpenAI.RequestOptions,
  ): Promise<
    | AsyncIterable<OpenAI.Responses.ResponseStreamEvent>
    | OpenAI.Responses.Response
  > {
    if (request.stream) {
      const stream = await super.completionWithRetry(request, requestOptions);
      return normalizeResponsesStream(stream);
    }
    const response = await super.completionWithRetry(request, requestOptions);
    return normalizeResponsesPayload(response);
  }
}

export function normalizeResponsesStreamEvent(
  event: OpenAI.Responses.ResponseStreamEvent,
): OpenAI.Responses.ResponseStreamEvent {
  if (!isRecord(event) || !("response" in event)) {
    return event;
  }
  const response = event["response"] as OpenAI.Responses.Response;
  const normalized = normalizeResponsesPayload(response);
  if (normalized === response) {
    return event;
  }
  return {
    ...event,
    response: normalized,
  } as OpenAI.Responses.ResponseStreamEvent;
}

export function normalizeResponsesPayload<T>(payload: T): T {
  if (!isRecord(payload) || !Array.isArray(payload["output"])) {
    return payload;
  }
  let responseChanged = false;
  const output = payload["output"].map((item) => {
    if (!isRecord(item) || !Array.isArray(item["content"])) {
      return item;
    }
    let itemChanged = false;
    const content = item["content"].map((part) => {
      if (!isRecord(part) || part["type"] !== "output_text") {
        return part;
      }
      if (part["annotations"] === undefined) {
        itemChanged = true;
        return { ...part, annotations: [] };
      }
      if (!Array.isArray(part["annotations"])) {
        throw new Error("Responses API output_text.annotations 必须为数组");
      }
      return part;
    });
    if (!itemChanged) {
      return item;
    }
    responseChanged = true;
    return { ...item, content };
  });
  if (!responseChanged) {
    return payload;
  }
  return { ...payload, output } as T;
}

async function* normalizeResponsesStream(
  stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
) {
  for await (const event of stream) {
    yield normalizeResponsesStreamEvent(event);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

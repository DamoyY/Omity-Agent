import { ChatOpenAIResponses } from "@langchain/openai";
import type { OpenAI } from "openai";

export class CompatibleChatOpenAIResponses extends ChatOpenAIResponses {
  override invocationParams(options?: this["ParsedCallOptions"]) {
    const params = super.invocationParams(options);
    return {
      ...params,
      include: mergeResponseIncludes(params.include, [
        "reasoning.encrypted_content",
      ]),
    };
  }

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
  if (!isRecord(event) || !("response" in event)) return event;
  const response = event["response"] as OpenAI.Responses.Response;
  const normalized = normalizeResponsesPayload(response);
  return normalized === response
    ? event
    : ({ ...event, response: normalized } as typeof event);
}

export function normalizeResponsesPayload<T>(payload: T): T {
  if (!isRecord(payload) || !Array.isArray(payload["output"])) return payload;
  let changed = false;
  const output = payload["output"].map((item) => {
    if (!isRecord(item) || !Array.isArray(item["content"])) return item;
    let itemChanged = false;
    const content = item["content"].map((part) => {
      if (!isRecord(part) || part["type"] !== "output_text") return part;
      if (part["annotations"] === undefined) {
        changed = true;
        itemChanged = true;
        return { ...part, annotations: [] };
      }
      if (!Array.isArray(part["annotations"])) {
        throw new Error("Responses API output_text.annotations 必须为数组");
      }
      return part;
    });
    return itemChanged ? { ...item, content } : item;
  });
  return changed ? ({ ...payload, output } as T) : payload;
}

async function* normalizeResponsesStream(
  stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
) {
  for await (const event of stream) yield normalizeResponsesStreamEvent(event);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mergeResponseIncludes(
  current: OpenAI.Responses.ResponseCreateParams["include"],
  required: OpenAI.Responses.ResponseCreateParams["include"],
) {
  return Array.from(new Set([...(current ?? []), ...(required ?? [])]));
}

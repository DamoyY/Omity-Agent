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
  const response = event.response as OpenAI.Responses.Response;
  const normalized = normalizeResponsesPayload(response);
  return normalized === response
    ? event
    : ({ ...event, response: normalized } as typeof event);
}

export function normalizeResponsesPayload<T>(payload: T): T {
  if (!isRecord(payload) || !isUnknownArray(payload["output"])) return payload;
  const original = payload["output"];
  const output = original.map(normalizeOutputItem);
  return output.every((item, index) => item === original[index])
    ? payload
    : { ...payload, output };
}

function normalizeOutputItem(item: unknown) {
  if (!isRecord(item) || !isUnknownArray(item["content"])) return item;
  const original = item["content"];
  const content = original.map(normalizeOutputPart);
  return content.every((part, index) => part === original[index])
    ? item
    : { ...item, content };
}

function normalizeOutputPart(part: unknown) {
  if (!isRecord(part) || part["type"] !== "output_text") return part;
  if (part["annotations"] === undefined) return { ...part, annotations: [] };
  if (!isUnknownArray(part["annotations"])) {
    throw new Error("Responses API output_text.annotations 必须为数组");
  }
  return part;
}

async function* normalizeResponsesStream(
  stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
) {
  for await (const event of stream) yield normalizeResponsesStreamEvent(event);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function mergeResponseIncludes(
  current: OpenAI.Responses.ResponseCreateParams["include"],
  required: OpenAI.Responses.ResponseCreateParams["include"],
) {
  return Array.from(new Set([...(current ?? []), ...(required ?? [])]));
}

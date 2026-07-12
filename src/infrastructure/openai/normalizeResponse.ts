import type { OpenAI } from "openai";

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
  if (!isRecord(payload) || !Array.isArray(payload["output"])) return payload;
  const original = payload["output"];
  const output = original.map(normalizeOutputItem);
  return output.every((item, index) => item === original[index])
    ? payload
    : { ...payload, output };
}

export async function* normalizeResponsesStream(
  stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
  onResponse: (response: OpenAI.Responses.Response) => void,
) {
  for await (const event of stream) {
    const normalized = normalizeResponsesStreamEvent(event);
    if (
      normalized.type === "response.completed" ||
      normalized.type === "response.incomplete"
    ) {
      onResponse(normalized.response);
    }
    yield normalized;
  }
}

function normalizeOutputItem(item: unknown) {
  if (!isRecord(item) || !Array.isArray(item["content"])) return item;
  const original = item["content"];
  const content = original.map(normalizeOutputPart);
  return content.every((part, index) => part === original[index])
    ? item
    : { ...item, content };
}

function normalizeOutputPart(part: unknown) {
  if (!isRecord(part) || part["type"] !== "output_text") return part;
  if (part["annotations"] === undefined) return { ...part, annotations: [] };
  if (!Array.isArray(part["annotations"])) {
    throw new Error("Responses API output_text.annotations 必须为数组");
  }
  return part;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

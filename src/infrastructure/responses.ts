import { ChatOpenAIResponses } from "@langchain/openai";
import { isDeepStrictEqual } from "node:util";
import type { OpenAI } from "openai";

type ResponseRequest =
  | OpenAI.Responses.ResponseCreateParamsStreaming
  | OpenAI.Responses.ResponseCreateParamsNonStreaming;

interface ResponseChain {
  request: ResponseRequest;
  responseId: string;
  output: OpenAI.Responses.ResponseOutputItem[];
}

export class CompatibleChatOpenAIResponses extends ChatOpenAIResponses {
  private responseChain?: ResponseChain;

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
    request: ResponseRequest,
    requestOptions?: OpenAI.RequestOptions,
  ): Promise<
    | AsyncIterable<OpenAI.Responses.ResponseStreamEvent>
    | OpenAI.Responses.Response
  > {
    if (request.stream) {
      const outgoing = incrementalRequest(request, this.responseChain);
      const stream = await super.completionWithRetry(outgoing, requestOptions);
      return normalizeResponsesStream(stream, (response) => {
        this.rememberResponse(request, response);
      });
    }
    const outgoing = incrementalRequest(request, this.responseChain);
    const response = await super.completionWithRetry(outgoing, requestOptions);
    const normalized = normalizeResponsesPayload(response);
    this.rememberResponse(request, normalized);
    return normalized;
  }

  private rememberResponse(
    request: ResponseRequest,
    response: OpenAI.Responses.Response,
  ) {
    if (response.status !== "completed" && response.status !== "incomplete") {
      return;
    }
    this.responseChain = {
      request,
      responseId: response.id,
      output: response.output,
    };
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

function incrementalRequest<T extends ResponseRequest>(
  request: T,
  chain: ResponseChain | undefined,
): T {
  if (
    !chain ||
    !Array.isArray(request.input) ||
    !Array.isArray(chain.request.input) ||
    !responsePropertiesMatch(chain.request, request)
  ) {
    return request;
  }
  const baseline = [...chain.request.input, ...chain.output];
  if (
    request.input.length <= baseline.length ||
    !isDeepStrictEqual(request.input.slice(0, baseline.length), baseline)
  ) {
    return request;
  }
  return {
    ...request,
    previous_response_id: chain.responseId,
    input: request.input.slice(baseline.length),
  };
}

function responsePropertiesMatch(
  previous: ResponseRequest,
  current: ResponseRequest,
) {
  return isDeepStrictEqual(
    responseProperties(previous),
    responseProperties(current),
  );
}

function responseProperties(request: ResponseRequest) {
  const properties: Record<string, unknown> = { ...request };
  delete properties["input"];
  delete properties["previous_response_id"];
  return properties;
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

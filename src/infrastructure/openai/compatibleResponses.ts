import { normalizeResponsesPayload, normalizeResponsesStream } from "./normalizeResponse";
import { ChatOpenAIResponses } from "@langchain/openai";
import type { OpenAI } from "openai";

export class CompatibleChatOpenAIResponses extends ChatOpenAIResponses {
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
  ): Promise<AsyncIterable<OpenAI.Responses.ResponseStreamEvent> | OpenAI.Responses.Response> {
    if (request.stream) {
      const stream = await super.completionWithRetry(
        normalizeResponsesRequest(request),
        requestOptions,
      );
      return normalizeResponsesStream(stream);
    }
    const response = await super.completionWithRetry(
      normalizeResponsesRequest(request),
      requestOptions,
    );
    return normalizeResponsesPayload(response);
  }
}

function normalizeResponsesRequest<
  Request extends
    | OpenAI.Responses.ResponseCreateParamsStreaming
    | OpenAI.Responses.ResponseCreateParamsNonStreaming,
>(request: Request): Request {
  if (!Array.isArray(request.input)) {
    return request;
  }
  const input = request.input.map((item, index) => normalizeInputItem(item, index));
  return { ...request, input };
}

function normalizeInputItem<Item>(item: Item, index: number): Item {
  if (!isRecord(item) || item["type"] !== "custom_tool_call" || item["id"] === undefined) {
    return item;
  }
  const { id } = item;
  if (id === "") {
    const normalized = { ...item };
    delete normalized["id"];
    return normalized;
  }
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/u.test(id)) {
    throw new Error(`Responses API input[${index.toString()}] custom tool call ID 无效`);
  }
  return item;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

import { ChatOpenAIResponses } from "@langchain/openai";
import type { OpenAI } from "openai";
import { normalizeResponsesPayload, normalizeResponsesStream } from "./normalizeResponse";
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
      const stream = await super.completionWithRetry(request, requestOptions);
      return normalizeResponsesStream(stream);
    }
    const response = await super.completionWithRetry(request, requestOptions);
    return normalizeResponsesPayload(response);
  }
}

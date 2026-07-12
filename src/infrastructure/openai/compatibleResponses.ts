import { ChatOpenAIResponses } from "@langchain/openai";
import type { OpenAI } from "openai";
import {
  normalizeResponsesPayload,
  normalizeResponsesStream,
} from "./normalizeResponse";

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

function mergeResponseIncludes(
  current: OpenAI.Responses.ResponseCreateParams["include"],
  required: OpenAI.Responses.ResponseCreateParams["include"],
) {
  return Array.from(new Set([...(current ?? []), ...(required ?? [])]));
}

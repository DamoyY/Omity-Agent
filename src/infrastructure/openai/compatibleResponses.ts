import { ChatOpenAIResponses } from "@langchain/openai";
import type { OpenAI } from "openai";
import {
  normalizeResponsesPayload,
  normalizeResponsesStream,
} from "./normalizeResponse";
import {
  incrementalRequest,
  type ResponseChain,
  type ResponseRequest,
} from "./responseContinuation";

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

function mergeResponseIncludes(
  current: OpenAI.Responses.ResponseCreateParams["include"],
  required: OpenAI.Responses.ResponseCreateParams["include"],
) {
  return Array.from(new Set([...(current ?? []), ...(required ?? [])]));
}

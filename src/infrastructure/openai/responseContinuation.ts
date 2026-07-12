import { isDeepStrictEqual } from "node:util";
import type { OpenAI } from "openai";

export type ResponseRequest =
  | OpenAI.Responses.ResponseCreateParamsStreaming
  | OpenAI.Responses.ResponseCreateParamsNonStreaming;

export interface ResponseChain {
  request: ResponseRequest;
  responseId: string;
  output: OpenAI.Responses.ResponseOutputItem[];
}

export function incrementalRequest<T extends ResponseRequest>(
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

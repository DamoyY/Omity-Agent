import type { AIMessage } from "@langchain/core/messages";

export function partitionToolResponse(
  original: AIMessage,
  callId: string,
  includeResponse: boolean,
) {
  return {
    additional_kwargs: partitionAdditionalKwargs(original, callId, includeResponse),
    content: includeResponse ? original.content : "",
    response_metadata: partitionResponseMetadata(original, callId, includeResponse),
    usage_metadata: includeResponse ? original.usage_metadata : undefined,
  };
}
function partitionAdditionalKwargs(original: AIMessage, callId: string, includeResponse: boolean) {
  const allCallIds = toolCallIds(original);
  return Object.fromEntries(
    Object.entries(original.additional_kwargs).flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        const partition = partitionCallItems(value, allCallIds, callId, includeResponse);
        return partition ? [[key, partition]] : [];
      }
      if (!isRecord(value)) {
        return includeResponse ? [[key, value]] : [];
      }
      const partition = partitionCallRecord(value, allCallIds, callId, includeResponse);
      return partition ? [[key, partition]] : [];
    }),
  );
}
function partitionResponseMetadata(original: AIMessage, callId: string, includeResponse: boolean) {
  const responseMetadata = includeResponse ? { ...original.response_metadata } : {};
  const { output } = original.response_metadata;
  if (!Array.isArray(output)) {
    return responseMetadata;
  }
  const partition = partitionCallItems(output, toolCallIds(original), callId, includeResponse);
  if (partition) {
    responseMetadata["output"] = partition;
  } else {
    delete responseMetadata["output"];
  }
  return responseMetadata;
}
function partitionCallItems(
  items: unknown[],
  allCallIds: Set<string>,
  callId: string,
  includeResponse: boolean,
) {
  const scoped = items.filter((item) => itemCallId(item, allCallIds) === callId);
  const response = includeResponse
    ? items.filter((item) => itemCallId(item, allCallIds) === undefined)
    : [];
  const partition = [...response, ...scoped];
  return partition.length > 0 ? partition : undefined;
}
function partitionCallRecord(
  value: Record<string, unknown>,
  allCallIds: Set<string>,
  callId: string,
  includeResponse: boolean,
) {
  const hasCallIds = Object.keys(value).some((id) => allCallIds.has(id));
  if (!hasCallIds) {
    return includeResponse ? value : undefined;
  }
  const partition = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key === callId || (includeResponse && !allCallIds.has(key)),
    ),
  );
  return Object.keys(partition).length > 0 ? partition : undefined;
}
function itemCallId(item: unknown, allCallIds: Set<string>) {
  if (!isRecord(item)) {
    return undefined;
  }
  const callId = item["call_id"];
  if (typeof callId === "string" && allCallIds.has(callId)) {
    return callId;
  }
  const { id } = item;
  return typeof id === "string" && allCallIds.has(id) ? id : undefined;
}
function toolCallIds(message: AIMessage) {
  return new Set(message.tool_calls?.flatMap((call) => (call.id ? [call.id] : [])));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

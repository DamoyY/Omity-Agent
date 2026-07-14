import type { BaseMessage } from "@langchain/core/messages";

export function freeformCallIds(message: BaseMessage) {
  const ids = new Set<string>();
  const idMap = message.additional_kwargs["__openai_custom_tool_call_ids__"];
  const responseOutput = isRecord(message.response_metadata)
    ? message.response_metadata["output"]
    : undefined;
  if (isRecord(idMap)) {
    for (const id of Object.keys(idMap)) {
      ids.add(id);
    }
  }
  for (const value of [message.additional_kwargs["tool_outputs"], responseOutput]) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRecord(item) && item["type"] === "custom_tool_call") {
          const id = item["call_id"];
          if (typeof id === "string") {
            ids.add(id);
          }
        }
      }
    }
  }
  return ids;
}
export function rawFreeformInput(input: unknown) {
  if (isRecord(input) && typeof input["input"] === "string") {
    return input["input"];
  }
  if (typeof input === "string") {
    return input;
  }
  throw new Error("Freeform 工具调用缺少原始字符串输入");
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

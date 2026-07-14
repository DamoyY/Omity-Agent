import type { TimelineMessage, TimelinePart } from "./types";
import { sameToolCall } from "./identity";
export function groupAssistantMessages(messages: TimelineMessage[]) {
  const result: TimelineMessage[] = [];
  let currentAssistant: TimelineMessage | undefined;
  for (const item of messages) {
    if (item.role !== "assistant") {
      currentAssistant = undefined;
      result.push(item);
    } else if (!currentAssistant) {
      currentAssistant = item;
      result.push(item);
    } else {
      mergeAssistant(currentAssistant, item);
      currentAssistant.id = item.id;
    }
  }
  return result;
}
function mergeAssistant(target: TimelineMessage, source: TimelineMessage) {
  target.content = [target.content, source.content]
    .filter((content) => content.trim().length > 0)
    .join("\n\n");
  for (const part of source.parts) {
    if (
      part.type !== "tool" ||
      !toolParts(target).some((item) => sameToolCall(item.call, part.call))
    ) {
      target.parts.push(part);
    }
  }
  if (source.usage) {
    target.usage = source.usage;
  }
}
function toolParts(message: TimelineMessage) {
  return message.parts.filter(
    (part): part is Extract<TimelinePart, { type: "tool" }> => part.type === "tool",
  );
}

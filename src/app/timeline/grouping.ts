import { sameToolCall } from "./identity";
import type { TimelineMessage, TimelinePart } from "./types";

export function groupAssistantMessages(messages: TimelineMessage[]) {
  const result: TimelineMessage[] = [];
  let currentAssistant: TimelineMessage | undefined;
  for (const item of messages) {
    if (item.role !== "assistant") {
      currentAssistant = undefined;
      result.push(item);
      continue;
    }
    if (!currentAssistant) {
      currentAssistant = item;
      result.push(item);
      continue;
    }
    mergeAssistant(currentAssistant, item);
    currentAssistant.id = item.id;
  }
  return result;
}

function mergeAssistant(target: TimelineMessage, source: TimelineMessage) {
  target.content = [target.content, source.content]
    .filter((content) => content.trim().length > 0)
    .join("\n\n");
  for (const part of source.parts) {
    if (part.type !== "tool") {
      target.parts.push(part);
      continue;
    }
    if (toolParts(target).some((item) => sameToolCall(item.call, part.call))) {
      continue;
    }
    target.parts.push(part);
  }
  if (source.usage) target.usage = source.usage;
}

function toolParts(message: TimelineMessage) {
  return message.parts.filter(
    (part): part is Extract<TimelinePart, { type: "tool" }> => part.type === "tool",
  );
}

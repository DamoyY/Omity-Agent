import {
  type DisplayEvent,
  type DisplayMessage,
  type DisplayQueue,
  buildTimeline,
} from "../../../src/app/timeline";
import { expect, test } from "bun:test";

test("keeps live output before a user append across persistence", () => {
  const rootUser = message(1, "user", "开始", 1);
  const firstOutput = message(2, "assistant", "第一段");
  const queue: DisplayQueue[] = [
    {
      content: "",
      error: null,
      id: 1,
      root: true,
      status: "running",
      userMessageId: 1,
    },
    {
      content: "追加问题",
      error: null,
      id: 2,
      root: false,
      status: "pending",
      userMessageId: null,
    },
  ];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "assistant_text_delta",
      payload: {
        kind: "assistant_text_delta",
        messageId: "live-output",
        queueId: 1,
        text: "第二段",
      },
    },
  ];
  const streaming = buildTimeline([rootUser, firstOutput], queue, events);
  const persisted = buildTimeline(
    [rootUser, firstOutput, message(3, "assistant", "第二段"), message(4, "user", "追加问题", 2)],
    [],
    [],
  );
  expect(summary(streaming)).toEqual(["user:开始", "assistant:第一段\n\n第二段", "user:追加问题"]);
  expect(summary(streaming)).toEqual(summary(persisted));
});
test("keeps a streaming tool call before a pending user append", () => {
  const queue: DisplayQueue[] = [
    {
      content: "",
      error: null,
      id: 1,
      root: true,
      status: "running",
      userMessageId: 1,
    },
    {
      content: "追加问题",
      error: null,
      id: 2,
      root: false,
      status: "pending",
      userMessageId: null,
    },
  ];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "tool_call_delta",
      payload: {
        call: { id: "call-1", index: 0, name: "inspect" },
        kind: "tool_call_delta",
        messageId: "live-tool",
        queueId: 1,
      },
    },
  ];
  const view = buildTimeline([message(1, "user", "开始", 1)], queue, events);
  expect(view.map(({ role }) => role)).toEqual(["user", "assistant", "user"]);
  expect(view[1]?.parts.some((part) => part.type === "tool" && part.call.id === "call-1")).toBe(
    true,
  );
  expect(view[2]?.content).toBe("追加问题");
});
function message(
  id: number,
  role: DisplayMessage["role"],
  content: string,
  queueId: number | null = null,
): DisplayMessage {
  return {
    content,
    createdAt: id,
    id,
    images: [],
    queueId,
    reasoning: "",
    role,
    sourceId: `message-${id.toString()}`,
    toolCalls: [],
  };
}
function summary(view: ReturnType<typeof buildTimeline>) {
  return view.map(({ role, content }) => `${role}:${content}`);
}

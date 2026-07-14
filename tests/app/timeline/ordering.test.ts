import { expect, test } from "bun:test";
import type { DisplayEvent, DisplayMessage, DisplayQueue } from "../../../src/app/timeline";
import { buildTimeline } from "../../../src/app/timeline";

test("keeps live output before a user append across persistence", () => {
  const rootUser = message(1, "user", "开始", 1);
  const firstOutput = message(2, "assistant", "第一段");
  const queue: DisplayQueue[] = [
    {
      id: 1,
      content: "",
      status: "running",
      error: null,
      userMessageId: 1,
      root: true,
    },
    {
      id: 2,
      content: "追加问题",
      status: "pending",
      error: null,
      userMessageId: null,
      root: false,
    },
  ];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "assistant_text_delta",
      payload: {
        kind: "assistant_text_delta",
        queueId: 1,
        messageId: "live-output",
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
      id: 1,
      content: "",
      status: "running",
      error: null,
      userMessageId: 1,
      root: true,
    },
    {
      id: 2,
      content: "追加问题",
      status: "pending",
      error: null,
      userMessageId: null,
      root: false,
    },
  ];
  const events: DisplayEvent[] = [
    {
      id: 1,
      message: "tool_call_delta",
      payload: {
        kind: "tool_call_delta",
        queueId: 1,
        messageId: "live-tool",
        call: { id: "call-1", index: 0, name: "inspect" },
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
    id,
    sourceId: `message-${id.toString()}`,
    role,
    content,
    reasoning: "",
    images: [],
    queueId,
    toolCalls: [],
    createdAt: id,
  };
}

function summary(view: ReturnType<typeof buildTimeline>) {
  return view.map(({ role, content }) => `${role}:${content}`);
}

import {
  type ChatActionState,
  deriveChatActionState,
  pauseRequestPending,
} from "../../../src/app/frontend/components/Chat/actionState";
import type { Control, SessionStatus } from "../../../src/types";
import { expect, test } from "bun:test";

interface MatrixCase {
  name: string;
  control: Control;
  pausing?: boolean;
  queue: string[];
  sessionStatus: SessionStatus;
  expected: ChatActionState;
}
const matrix: MatrixCase[] = [
  {
    control: "running",
    expected: state("pause", true, "pause", false, false),
    name: "idle session without active queue",
    queue: [],
    sessionStatus: "idle",
  },
  {
    control: "running",
    expected: state("pause", false, "pause", true, true),
    name: "orphan running queue on an idle session",
    queue: ["running"],
    sessionStatus: "idle",
  },
  {
    control: "running",
    expected: state("resume", false, "running", false, false),
    name: "persisted paused queue with stale running control",
    queue: ["paused"],
    sessionStatus: "idle",
  },
  {
    control: "running",
    expected: state("pause", false, "pause", true, true),
    name: "running queue takes precedence over a paused queue",
    queue: ["paused", "running"],
    sessionStatus: "idle",
  },
  {
    control: "pause",
    expected: state("resume", false, "running", false, false),
    name: "pause control without a paused queue",
    queue: [],
    sessionStatus: "idle",
  },
  {
    control: "pause_cancel",
    expected: state("resume", false, "running", true, true),
    name: "pause-cancel control while a queue is still running",
    queue: ["running"],
    sessionStatus: "idle",
  },
  {
    control: "running",
    expected: state("pausing", true, "pause", true, true),
    name: "locally pending pause",
    pausing: true,
    queue: ["running"],
    sessionStatus: "model",
  },
  {
    control: "running",
    expected: state("resume", false, "running", false, false),
    name: "persisted pause supersedes a stale local pausing flag",
    pausing: true,
    queue: ["paused"],
    sessionStatus: "idle",
  },
  {
    control: "running",
    expected: state("pause", false, "pause", true, false),
    name: "active model without a queue",
    queue: [],
    sessionStatus: "model",
  },
];
test.each(matrix)("derives chat actions for $name", (entry) => {
  expect(
    deriveChatActionState({
      control: entry.control,
      pausing: entry.pausing ?? false,
      queue: entry.queue.map((status) => ({ status })),
      sessionStatus: entry.sessionStatus,
    }),
  ).toEqual(entry.expected);
});
test("pause request remains pending until the running queue reaches a boundary", () => {
  expect(pauseRequestPending("session", "session", [{ status: "running" }])).toBe(true);
  expect(pauseRequestPending("session", "session", [{ status: "paused" }])).toBe(false);
  expect(pauseRequestPending("session", "session", [{ status: "done" }])).toBe(false);
});
function state(
  controlState: ChatActionState["controlState"],
  controlDisabled: boolean,
  nextControl: ChatActionState["nextControl"],
  deleteDisabled: boolean,
  queueRunning: boolean,
): ChatActionState {
  return {
    controlDisabled,
    controlState,
    deleteDisabled,
    nextControl,
    queueRunning,
  };
}

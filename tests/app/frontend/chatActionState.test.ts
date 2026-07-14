import { expect, test } from "bun:test";
import {
  deriveChatActionState,
  type ChatActionState,
} from "../../../src/app/frontend/components/Chat/actionState";
import type { Control, SessionStatus } from "../../../src/types";
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
    name: "idle session without active queue",
    control: "running",
    queue: [],
    sessionStatus: "idle",
    expected: state("pause", true, "pause", false, false),
  },
  {
    name: "orphan running queue on an idle session",
    control: "running",
    queue: ["running"],
    sessionStatus: "idle",
    expected: state("pause", false, "pause", true, true),
  },
  {
    name: "persisted paused queue with stale running control",
    control: "running",
    queue: ["paused"],
    sessionStatus: "idle",
    expected: state("resume", false, "running", false, false),
  },
  {
    name: "running queue takes precedence over a paused queue",
    control: "running",
    queue: ["paused", "running"],
    sessionStatus: "idle",
    expected: state("pause", false, "pause", true, true),
  },
  {
    name: "pause control without a paused queue",
    control: "pause",
    queue: [],
    sessionStatus: "idle",
    expected: state("resume", false, "running", false, false),
  },
  {
    name: "pause-cancel control while a queue is still running",
    control: "pause_cancel",
    queue: ["running"],
    sessionStatus: "idle",
    expected: state("resume", false, "running", true, true),
  },
  {
    name: "locally pending pause",
    control: "running",
    pausing: true,
    queue: ["running"],
    sessionStatus: "model",
    expected: state("pausing", true, "pause", true, true),
  },
  {
    name: "persisted pause supersedes a stale local pausing flag",
    control: "running",
    pausing: true,
    queue: ["paused"],
    sessionStatus: "idle",
    expected: state("resume", false, "running", false, false),
  },
  {
    name: "active model without a queue",
    control: "running",
    queue: [],
    sessionStatus: "model",
    expected: state("pause", false, "pause", true, false),
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

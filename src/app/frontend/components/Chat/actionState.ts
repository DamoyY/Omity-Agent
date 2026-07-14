import type { Control, SessionStatus } from "../../../../types";
export type ChatControlState = "pause" | "pausing" | "resume";
type RequestedControl = Extract<Control, "running" | "pause">;
interface QueueState {
  status: string;
}
interface ChatActionInput {
  control: Control;
  pausing: boolean;
  queue: QueueState[];
  sessionStatus?: SessionStatus;
}
export interface ChatActionState {
  controlDisabled: boolean;
  controlState: ChatControlState;
  deleteDisabled: boolean;
  nextControl: RequestedControl;
  queueRunning: boolean;
}
export function deriveChatActionState({
  control,
  pausing,
  queue,
  sessionStatus,
}: ChatActionInput): ChatActionState {
  const queueRunning = queue.some(({ status }) => status === "running");
  const queuePaused = queue.some(({ status }) => status === "paused");
  const resumable =
    control === "pause" || control === "pause_cancel" || (queuePaused && !queueRunning);
  const waitingForPause = pausing && !resumable;
  return {
    controlDisabled: waitingForPause || (!resumable && sessionStatus === "idle" && !queueRunning),
    controlState: waitingForPause ? "pausing" : (resumable ? "resume" : "pause"),
    deleteDisabled: queueRunning || sessionStatus === "model" || sessionStatus === "tool",
    nextControl: resumable ? "running" : "pause",
    queueRunning,
  };
}

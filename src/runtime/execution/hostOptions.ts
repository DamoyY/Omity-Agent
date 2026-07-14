import type { ProcessOwner } from "../../infrastructure/process/ownership";
import type { HostObserver } from "../context";
export interface HostControls {
  cancelTool(callId: string): boolean;
}
export interface HostRunOptions {
  controller?: AbortController;
  cwd?: string;
  observer?: HostObserver;
  onReady?: (controls: HostControls) => void;
  owner?: ProcessOwner;
  quiet?: boolean;
  recoverInterrupted?: boolean;
  stoppingController?: AbortController;
  wake?: (delayMs: number) => Promise<void>;
  wireSigint?: boolean;
}

import type { ProcessOwner } from "../../infrastructure/process/ownership";
import type { HostObserver } from "../context";

export interface HostRunOptions {
  controller?: AbortController;
  cwd?: string;
  observer?: HostObserver;
  onReady?: () => void;
  owner?: ProcessOwner;
  quiet?: boolean;
  recoverInterrupted?: boolean;
  stoppingController?: AbortController;
  wake?: (delayMs: number) => Promise<void>;
  wireSigint?: boolean;
}

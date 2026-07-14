export interface ToolExecutionHandle {
  signal: AbortSignal;
  cancellationDurationMs(): number | undefined;
  complete(): void;
}

interface ToolExecution {
  announcedAt: number;
  cancelledAt?: number;
  controller: AbortController;
  requestCompleted: boolean;
  requestStarted: boolean;
  timer?: ReturnType<typeof setInterval>;
}

const executionsBySignal = new WeakMap<AbortSignal, ToolExecution>();

interface ToolExecutionsOptions {
  cancellationRequested?: (callId: string) => boolean;
  now?: () => number;
  pollMs?: number;
}

export class ToolExecutions {
  private readonly executions = new Map<string, ToolExecution>();
  private readonly now: () => number;

  constructor(private readonly options: ToolExecutionsOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  announce(callId: string) {
    this.executions.set(callId, this.createExecution());
  }

  begin(callId: string, parentSignal?: AbortSignal): ToolExecutionHandle {
    const execution = this.executions.get(callId) ?? this.createExecution();
    if (executionsBySignal.has(execution.controller.signal)) {
      throw new Error(`工具调用已在运行：${callId}`);
    }
    this.executions.set(callId, execution);
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, execution.controller.signal])
      : execution.controller.signal;
    executionsBySignal.set(signal, execution);
    this.startPolling(callId, execution);
    return {
      signal,
      cancellationDurationMs: () =>
        execution.cancelledAt === undefined
          ? undefined
          : Math.max(0, execution.cancelledAt - execution.announcedAt),
      complete: () => {
        if (execution.timer) clearInterval(execution.timer);
        if (this.executions.get(callId) === execution) {
          this.executions.delete(callId);
        }
      },
    };
  }

  cancel(callId: string) {
    const execution = this.executions.get(callId);
    if (!execution || execution.cancelledAt !== undefined || execution.requestCompleted) {
      return false;
    }
    execution.cancelledAt = this.now();
    abortCancelledRequest(execution);
    return true;
  }

  private createExecution(): ToolExecution {
    return {
      announcedAt: this.now(),
      controller: new AbortController(),
      requestCompleted: false,
      requestStarted: false,
    };
  }

  private startPolling(callId: string, execution: ToolExecution) {
    if (!this.options.cancellationRequested) return;
    const check = () => {
      if (this.options.cancellationRequested?.(callId)) {
        this.cancel(callId);
      }
    };
    check();
    if (execution.cancelledAt !== undefined) return;
    execution.timer = setInterval(check, this.options.pollMs ?? 100);
    execution.timer.unref();
  }
}

export function markMcpRequestStarted(signal?: AbortSignal) {
  const execution = signal ? executionsBySignal.get(signal) : undefined;
  if (!execution) return;
  execution.requestStarted = true;
  abortCancelledRequest(execution);
}

export function markMcpRequestCompleted(signal?: AbortSignal) {
  const execution = signal ? executionsBySignal.get(signal) : undefined;
  if (execution) execution.requestCompleted = true;
}

function abortCancelledRequest(execution: ToolExecution) {
  if (execution.cancelledAt === undefined || !execution.requestStarted) return;
  execution.controller.abort(new Error("用户手动终止工具"));
}

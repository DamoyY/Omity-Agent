import type { Logger } from "../../infrastructure/logging/logger";

interface HostSignalOptions {
  enabled: boolean;
  force: AbortController;
  logger: Logger;
  stopping: AbortController;
  timeoutMs: number;
}
export function wireHostSignals(options: HostSignalOptions) {
  if (!options.enabled) {
    return () => undefined;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const stop = (signal: NodeJS.Signals) => {
    const reason = new Error(`收到 ${signal}`);
    if (options.stopping.signal.aborted) {
      options.force.abort(reason);
      return;
    }
    options.stopping.abort(reason);
    options.logger.warn(`收到 ${signal}，Host 将在可恢复边界停止`);
    timeout = setTimeout(() => {
      options.force.abort(new Error("Host 未在关闭期限内到达恢复边界"));
    }, options.timeoutMs);
    timeout.unref();
  };
  const onSigint = () => {
    stop("SIGINT");
  };
  const onSigterm = () => {
    stop("SIGTERM");
  };
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  return () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  };
}

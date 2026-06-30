import type { HostContext } from "./context";
import { contentToText } from "./content";

export function handleStreamEvent(ctx: HostContext, event: unknown) {
  if (!Array.isArray(event) || event.length !== 2) {
    ctx.logger.debug("LangGraph 事件", event);
    return;
  }
  const [mode, payload] = event;
  if (mode === "messages") {
    const chunk = Array.isArray(payload) ? payload[0] : undefined;
    const text = contentToText(chunk?.content);
    if (text && ctx.settings.logging.streamTokens) {
      ctx.logger.token(text);
    }
    return;
  }
  if (mode === "updates") {
    ctx.logger.debug("状态更新", summarize(payload));
    return;
  }
  ctx.logger.debug("调试事件", summarize(payload));
}

function summarize(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, current) =>
      typeof current === "string" && current.length > 240
        ? `${current.slice(0, 240)}…`
        : current,
    ),
  );
}

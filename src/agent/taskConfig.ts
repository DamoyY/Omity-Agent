import { CallbackManager } from "@langchain/core/callbacks/manager";
import type { RunnableConfig } from "@langchain/core/runnables";
export function normalizeTaskConfig<T extends RunnableConfig>(config: T): T {
  const source = config.callbacks;
  if (!(source instanceof CallbackManager)) {
    return config;
  }
  const handlers = [...new Set(source.handlers)];
  const inheritableHandlers = [...new Set(source.inheritableHandlers)];
  if (
    handlers.length === source.handlers.length &&
    inheritableHandlers.length === source.inheritableHandlers.length
  ) {
    return config;
  }
  const callbacks = new CallbackManager(source.getParentRunId(), {
    handlers,
    inheritableHandlers,
    inheritableMetadata: { ...source.inheritableMetadata },
    inheritableTags: [...source.inheritableTags],
    metadata: { ...source.metadata },
    tags: [...source.tags],
  });
  return { ...config, callbacks };
}

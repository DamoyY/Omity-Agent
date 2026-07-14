import type { AppHostEvents } from "./hosts";
import type { SessionInfo } from "./sessionState";
import { displayStreamEvent } from "./timeline";
import type { AppEvents } from "./events";
export function controllerHostEvents(
  events: AppEvents,
  sessionInfo: (sessionId: string) => SessionInfo,
  changed: (sessionId: string) => void,
): AppHostEvents {
  return {
    activity: (sessionId) => {
      events.notifySession(sessionInfo(sessionId));
    },
    changed,
    transcript: (sessionId, event) => {
      events.notifyTranscript(sessionId, displayStreamEvent(event));
    },
    wait: (sessionId, delayMs) => events.wait(sessionId, delayMs),
  };
}

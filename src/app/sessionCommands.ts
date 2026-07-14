import type { AppHosts } from "./hosts";
import { requestHostToolCancellation } from "../sessionStorage";
import { toolNotRunning } from "../errors";

export function cancelSessionTool(
  hosts: AppHosts,
  root: string,
  sessionId: string,
  toolCallId: string,
) {
  if (hosts.has(sessionId)) {
    if (!hosts.cancelTool(sessionId, toolCallId)) {
      throw toolNotRunning(toolCallId);
    }
  } else {
    requestHostToolCancellation(sessionId, toolCallId, root);
  }
  return { toolCallId };
}

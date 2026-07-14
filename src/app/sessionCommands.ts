import type { AppHosts } from "./hosts";
import { toolNotRunning } from "../errors";
import { requestHostToolCancellation } from "../sessionStorage";
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

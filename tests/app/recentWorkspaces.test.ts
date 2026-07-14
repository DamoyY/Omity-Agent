import { expect, test } from "bun:test";
import type { SessionInfo } from "../../src/app/frontend/services/client";
import { recentWorkspaces } from "../../src/app/frontend/services/recentWorkspaces";

test("recent workspaces preserve session order, remove duplicates, and cap results", () => {
  const paths = ["F:/six", "F:/five", "F:/four", "F:/three", "F:/two", "F:/one"];
  const sessions = [...paths, "F:/four"].map((workspace, index) => session(workspace, index));
  expect(recentWorkspaces(sessions)).toEqual(paths.slice(0, 5));
});
function session(workspace: string, index: number): SessionInfo {
  return {
    createdAt: index,
    error: null,
    id: index.toString(),
    status: "idle",
    updatedAt: index,
    workspace,
  };
}

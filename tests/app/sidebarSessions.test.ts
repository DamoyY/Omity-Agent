import { describe, expect, test } from "bun:test";
import { groupSessions, isRunning } from "../../src/app/frontend/components/Sidebar/sessions";
import type { SessionInfo } from "../../src/app/frontend/services/client";
describe("侧栏会话排序", () => {
  test("运行工作区和运行会话优先，同时保持工作区聚类", () => {
    const input = [
      session("history-new", "F:/history", "idle", 900),
      session("alpha-old", "F:/alpha", "idle", 100),
      session("beta-tool", "F:/beta", "tool", 300),
      session("alpha-model", "F:/alpha", "model", 200),
      session("beta-new", "F:/beta", "idle", 800),
    ];
    const groups = groupSessions(input);
    expect(groups.map(({ workspace }) => workspace)).toEqual(["F:/beta", "F:/alpha", "F:/history"]);
    expect(groups.map(({ sessions }) => sessions.map(({ id }) => id))).toEqual([
      ["beta-tool", "beta-new"],
      ["alpha-model", "alpha-old"],
      ["history-new"],
    ]);
    expect(input.map(({ id }) => id)).toEqual([
      "history-new",
      "alpha-old",
      "beta-tool",
      "alpha-model",
      "beta-new",
    ]);
  });
  test("只有模型和工具状态属于运行中", () => {
    const runningStatuses: SessionInfo["status"][] = ["model", "tool"];
    expect(runningStatuses.map((status) => isRunning(session("id", "F:/", status, 1)))).toEqual([
      true,
      true,
    ]);
    const stoppedStatuses: SessionInfo["status"][] = ["idle", "paused", "error"];
    expect(stoppedStatuses.map((status) => isRunning(session("id", "F:/", status, 1)))).toEqual([
      false,
      false,
      false,
    ]);
  });
  test("相同时间使用创建时间和 id 得到确定顺序", () => {
    const groups = groupSessions([
      session("z", "F:/same", "idle", 100, 10),
      session("b", "F:/same", "idle", 100, 20),
      session("a", "F:/same", "idle", 100, 20),
    ]);
    expect(groups[0]?.sessions.map(({ id }) => id)).toEqual(["a", "b", "z"]);
  });
});
function session(
  id: string,
  workspace: string,
  status: SessionInfo["status"],
  updatedAt: number,
  createdAt = updatedAt,
): SessionInfo {
  return { createdAt, error: null, id, status, updatedAt, workspace };
}

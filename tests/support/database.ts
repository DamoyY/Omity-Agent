import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentDatabase } from "../../src/infrastructure/database";

const dirs: string[] = [];

export const workspace = "F:\\workspace\\test";

export function makeDb() {
  return required(makeDatabases(1)[0], "测试数据库创建失败");
}

export function required<T>(
  value: T | null | undefined,
  message = "测试所需值不存在",
): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

export function makeDatabases(count: number) {
  const dir = mkdtempSync(join(tmpdir(), "agent-db-"));
  dirs.push(dir);
  const path = join(dir, "app.sqlite");
  return Array.from({ length: count }, () => new AgentDatabase(path));
}

export async function cleanupDatabaseDirs() {
  for (const dir of dirs.splice(0)) {
    await removeDatabaseDir(dir);
  }
}

async function removeDatabaseDir(dir: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isBusy(error) || attempt === 29) throw error;
      await Bun.sleep(100);
    }
  }
}

function isBusy(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EBUSY";
}

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentDatabase } from "../../src/infrastructure/database";

const dirs: string[] = [];

export const workspace = "F:\\workspace\\test";

export function makeDb() {
  return makeDatabases(1)[0]!;
}

export function makeDatabases(count: number) {
  const dir = mkdtempSync(join(tmpdir(), "agent-db-"));
  dirs.push(dir);
  const path = join(dir, "app.sqlite");
  return Array.from({ length: count }, () => new AgentDatabase(path));
}

export function cleanupDatabaseDirs() {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50,
    });
  }
}

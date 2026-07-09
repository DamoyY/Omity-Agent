import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentDatabase } from "../../src/infrastructure/database";

const dirs: string[] = [];

export const workspace = "F:\\workspace\\test";

export function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), "agent-db-"));
  dirs.push(dir);
  return new AgentDatabase(join(dir, "app.sqlite"));
}

export function cleanupDatabaseDirs() {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

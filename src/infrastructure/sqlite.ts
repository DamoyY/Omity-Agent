import type { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import { parse, resolve } from "node:path";

export const sqliteBusyTimeoutMs = 5_000;

interface QueryCacheDatabase extends Database {
  clearQueryCache(): void;
}

export function configureDatabase(db: Database) {
  db.run(`PRAGMA busy_timeout = ${sqliteBusyTimeoutMs.toString()}`);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
}

export function closeDatabase(db: Database) {
  const current = db as QueryCacheDatabase;
  current.clearQueryCache();
  // Bun keeps temporary query wrappers alive until GC, which blocks close(true).
  Bun.gc(true);
  current.close(true);
}

export function removeDatabaseDirectory(path: string) {
  const target = resolve(path);
  if (target === parse(target).root) {
    throw new Error(`拒绝删除磁盘根目录：${target}`);
  }
  rmSync(target, {
    recursive: true,
    force: true,
    maxRetries: 50,
    retryDelay: 50,
  });
}

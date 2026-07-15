import { parse, resolve } from "node:path";
import type { Database } from "bun:sqlite";
import { rmSync } from "node:fs";

export const sqliteBusyTimeoutMs = 5000;
export function configureDatabase(db: Database) {
  db.run(`PRAGMA busy_timeout = ${sqliteBusyTimeoutMs.toString()}`);
  db.run("PRAGMA auto_vacuum = INCREMENTAL");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA journal_size_limit = 4194304");
  db.run("PRAGMA foreign_keys = ON");
}
export function configureReadonlyDatabase(db: Database) {
  db.run(`PRAGMA busy_timeout = ${sqliteBusyTimeoutMs.toString()}`);
  db.run("PRAGMA foreign_keys = ON");
}
export function closeDatabase(db: Database) {
  const clearQueryCache: unknown = Reflect.get(db, "clearQueryCache");
  if (typeof clearQueryCache !== "function") {
    throw new Error("当前 Bun SQLite 不支持清理查询缓存");
  }
  Reflect.apply(clearQueryCache, db, []);
  // Bun keeps temporary query wrappers alive until GC, which blocks close(true).
  Bun.gc(true);
  db.close(true);
}

export function reclaimDatabasePages(db: Database) {
  db.run("PRAGMA busy_timeout = 0");
  try {
    db.run("PRAGMA incremental_vacuum(64)");
    db.run("PRAGMA wal_checkpoint(PASSIVE)");
    return true;
  } catch (error) {
    if (isSqliteBusy(error)) {
      return false;
    }
    throw error;
  } finally {
    db.run(`PRAGMA busy_timeout = ${sqliteBusyTimeoutMs.toString()}`);
  }
}
export function removeDatabaseDirectory(path: string) {
  const target = resolve(path);
  if (target === parse(target).root) {
    throw new Error(`拒绝删除磁盘根目录：${target}`);
  }
  rmSync(target, {
    force: true,
    maxRetries: 50,
    recursive: true,
    retryDelay: 50,
  });
}

function isSqliteBusy(value: unknown) {
  return (
    typeof value === "object" && value !== null && "code" in value && value.code === "SQLITE_BUSY"
  );
}

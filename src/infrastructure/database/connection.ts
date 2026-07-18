import type { Database, SQLQueryBindings } from "bun:sqlite";
import { parse, resolve } from "node:path";
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
  Bun.gc(true);
  db.close(true);
}
export function queryAll<Row>(db: Database, sql: string, ...params: SQLQueryBindings[]) {
  const query = db.prepare<Row, SQLQueryBindings[]>(sql);
  try {
    return query.all(...params);
  } finally {
    query.finalize();
  }
}
export function queryGet<Row>(db: Database, sql: string, ...params: SQLQueryBindings[]) {
  return queryAll<Row>(db, sql, ...params)[0] ?? null;
}
export function runTransaction<T>(db: Database, operation: () => T): T {
  if (!db.inTransaction) {
    db.run("BEGIN");
    try {
      const result = operation();
      db.run("COMMIT");
      return result;
    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }
  }
  const savepoint = "omity_nested";
  db.run(`SAVEPOINT ${savepoint}`);
  try {
    const result = operation();
    db.run(`RELEASE ${savepoint}`);
    return result;
  } catch (error) {
    db.run(`ROLLBACK TO ${savepoint}`);
    db.run(`RELEASE ${savepoint}`);
    throw error;
  }
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

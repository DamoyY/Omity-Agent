import type { Database } from "bun:sqlite";

export const migrationSql = [
  `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace TEXT NOT NULL,
      control TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      user_message_id INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      message_json TEXT NOT NULL,
      queue_id INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `,
] as const;

export function applySchema(db: Database) {
  for (const sql of migrationSql) db.run(sql);
  assertColumns(db, "sessions", [
    "id",
    "workspace",
    "control",
    "status",
    "created_at",
    "updated_at",
  ]);
}

function assertColumns(db: Database, table: string, columns: string[]) {
  const existing = new Set(
    db
      .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name),
  );
  const missing = columns.filter((column) => !existing.has(column));
  if (missing.length > 0) {
    throw new Error(`数据库结构错误：${table} 表缺少列：${missing.join(", ")}`);
  }
}

import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import type { SQLQueryBindings } from "bun:sqlite";
import { createTestDirectory } from "./artifacts";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dirs: string[] = [];
export const workspace = String.raw`F:\workspace\test`;
export function afterQuery(
  database: AgentDatabase,
  sqlFragment: string,
  operation: () => void,
): AgentDatabase {
  let completed = false;
  const sqlite = new Proxy(database.db, {
    get(target, property) {
      if (property === "prepare") {
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.includes(sqlFragment)) {
            return statement;
          }
          return new Proxy(statement, {
            get(statementTarget, statementProperty) {
              if (statementProperty === "all") {
                return (...params: SQLQueryBindings[]) => {
                  const rows = statementTarget.all(...params);
                  if (!completed) {
                    completed = true;
                    operation();
                  }
                  return rows;
                };
              }
              const value = Reflect.get(
                statementTarget,
                statementProperty,
                statementTarget,
              ) as unknown;
              return typeof value === "function" ? value.bind(statementTarget) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new Proxy(database, {
    get(target, property) {
      if (property === "db") {
        return sqlite;
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
export function makeDb() {
  return required(makeDatabases(1)[0], "测试数据库创建失败");
}
export function required<T>(value: T | null | undefined, message = "测试所需值不存在"): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}
export function makeDatabases(count: number) {
  const dir = createTestDirectory("database");
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
    let removed = false;
    try {
      rmSync(dir, { force: true, recursive: true });
      removed = true;
    } catch (error) {
      if (!isBusy(error) || attempt === 29) {
        throw error;
      }
    }
    if (removed) {
      return;
    }
    await Bun.sleep(100);
  }
}
function isBusy(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EBUSY";
}

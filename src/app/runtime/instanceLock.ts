import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isProcessRunning } from "../../infrastructure/process/ownership";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";

const ownerSchema = z.object({
  pid: z.number().int().positive(),
  token: z.uuid(),
});
export type AppInstanceOwner = z.infer<typeof ownerSchema>;
export class AppInstanceLock {
  private released = false;
  private constructor(
    private readonly path: string,
    readonly owner: AppInstanceOwner,
    readonly abandonedOwner?: AppInstanceOwner,
  ) {}
  static acquire(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    const path = resolve(dataDir, "app.lock");
    let abandonedOwner: AppInstanceOwner | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const owner = { pid: process.pid, token: randomUUID() };
      try {
        const descriptor = openSync(path, "wx");
        try {
          writeFileSync(descriptor, JSON.stringify(owner), "utf8");
        } catch (error) {
          closeSync(descriptor);
          unlinkSync(path);
          throw error;
        }
        closeSync(descriptor);
        return new AppInstanceLock(path, owner, abandonedOwner);
      } catch (error) {
        if (!isExistsError(error)) {
          throw error;
        }
        const existingOwner = readOwner(path);
        if (isProcessRunning(existingOwner.pid)) {
          throw new Error(
            `数据目录已有 App 在运行（PID ${existingOwner.pid.toString()}）：${dataDir}`,
            {
              cause: error,
            },
          );
        }
        abandonedOwner = existingOwner;
        unlinkSync(path);
      }
    }
    throw new Error(`无法获取 App 实例锁：${path}`);
  }
  release() {
    if (this.released) {
      return;
    }
    const owner = readOwner(this.path);
    if (owner.token !== this.owner.token) {
      throw new Error(`App 实例锁所有者已变化：${this.path}`);
    }
    unlinkSync(this.path);
    this.released = true;
  }
}
function readOwner(path: string) {
  if (!existsSync(path)) {
    throw new Error(`App 实例锁不存在：${path}`);
  }
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  const parsed = ownerSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`App 实例锁内容无效：${path}`);
  }
  return parsed.data;
}
function isExistsError(error: unknown) {
  return isErrorCode(error, "EEXIST");
}
function isErrorCode(error: unknown, code: string) {
  return (
    error instanceof Error && "code" in error && (error as Error & { code?: unknown }).code === code
  );
}

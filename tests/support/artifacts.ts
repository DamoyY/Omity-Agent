import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const testArtifactsRoot = join(tmpdir(), "omity-test");
export function clearTestArtifacts() {
  rmSync(testArtifactsRoot, {
    force: true,
    maxRetries: 50,
    recursive: true,
    retryDelay: 50,
  });
  mkdirSync(testArtifactsRoot, { recursive: true });
}
export function createTestDirectory(name: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
    throw new Error(`测试产物目录名称无效：${name}`);
  }
  mkdirSync(testArtifactsRoot, { recursive: true });
  return mkdtempSync(join(testArtifactsRoot, `${name}-`));
}

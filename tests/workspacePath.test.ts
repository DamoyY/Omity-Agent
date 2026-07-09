import { resolve } from "node:path";
import { expect, test } from "bun:test";
import { normalizeWorkspacePath } from "../src/infrastructure/workspacePath";

const env = {
  MIXED_ROOT: "C:/Users/example",
  TEMP_ROOT: "F:\\Temp",
  USERPROFILE: "C:\\Users\\tester",
};

test("workspace path expands environment variables and strips quotes", () => {
  expect(
    normalizeWorkspacePath('"%MIXED_ROOT%/project"', "F:\\base", env),
  ).toBe("C:\\Users\\example\\project");
  expect(
    normalizeWorkspacePath("'$env:TEMP_ROOT/workspace'", "F:\\base", env),
  ).toBe("F:\\Temp\\workspace");
  expect(normalizeWorkspacePath('"${USERPROFILE}/repo"', "F:\\base", env)).toBe(
    "C:\\Users\\tester\\repo",
  );
});

test("workspace path normalizes drive roots and repeated separators", () => {
  expect(normalizeWorkspacePath("C:", "F:\\base", env)).toBe("C:\\");
  expect(
    normalizeWorkspacePath("C://Users//example//repo", "F:\\base", env),
  ).toBe("C:\\Users\\example\\repo");
});

test("workspace path resolves relative paths from the supplied base", () => {
  expect(normalizeWorkspacePath("./repo", "F:\\base", env)).toBe(
    resolve("F:\\base", "repo"),
  );
});

test("workspace path reports empty input and undefined environment variables", () => {
  expect(() => normalizeWorkspacePath("   ", "F:\\base", env)).toThrow(
    "工作目录不能为空",
  );
  expect(() =>
    normalizeWorkspacePath("%NO_SUCH_ENV%/repo", "F:\\base", env),
  ).toThrow("环境变量未定义：NO_SUCH_ENV");
});

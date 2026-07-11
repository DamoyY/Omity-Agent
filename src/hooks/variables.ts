const exactVariable = /^\$\{([^}]+)\}$/;
const embeddedVariable = /\$\{([^}]+)\}/g;

export type HookVariables = {
  cwd: string;
  previousToolOutput?: unknown;
};

export function resolveHookArgs(
  args: Record<string, unknown>,
  variables: HookVariables,
) {
  return resolveValue(args, variables) as Record<string, unknown>;
}

function resolveValue(value: unknown, variables: HookVariables): unknown {
  if (typeof value === "string") return resolveString(value, variables);
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, variables));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      resolveValue(item, variables),
    ]),
  );
}

function resolveString(value: string, variables: HookVariables) {
  const exact = exactVariable.exec(value);
  if (exact) return variableValue(requireName(exact), variables);
  return value.replace(embeddedVariable, (placeholder, name: string) => {
    const resolved = variableValue(name, variables);
    if (!isScalar(resolved)) {
      throw new Error(`Hook 变量 ${placeholder} 不能将数组或对象嵌入字符串`);
    }
    return String(resolved);
  });
}

function variableValue(name: string, variables: HookVariables) {
  if (name === "cwd") return variables.cwd;
  if (name === "previousTool.output") {
    if (variables.previousToolOutput === undefined) {
      throw new Error(
        "Hook 变量 ${previousTool.output} 没有可用的前序工具输出",
      );
    }
    return variables.previousToolOutput;
  }
  throw new Error(`未知 Hook 变量：\${${name}}`);
}

function requireName(match: RegExpExecArray) {
  const name = match[1];
  if (!name) throw new Error(`无效 Hook 变量：${match[0]}`);
  return name;
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

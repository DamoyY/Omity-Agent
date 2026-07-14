const exactVariable = /^\$\{(?<name>[^}]+)\}$/;
const embeddedVariable = /\$\{(?<name>[^}]+)\}/g;
export interface HookVariables {
  cwd: string;
  previousTool?: {
    output: unknown;
    structuredOutput?: unknown;
  };
}
export function resolveHookArgs(args: Record<string, unknown>, variables: HookVariables) {
  return resolveRecord(args, variables);
}
function resolveValue(value: unknown, variables: HookVariables): unknown {
  if (typeof value === "string") {
    return resolveString(value, variables);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, variables));
  }
  if (!isRecord(value)) {
    return value;
  }
  return resolveRecord(value, variables);
}
function resolveRecord(value: Record<string, unknown>, variables: HookVariables) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, resolveValue(item, variables)]),
  );
}
function resolveString(value: string, variables: HookVariables) {
  const exact = exactVariable.exec(value);
  if (exact) {
    return variableValue(requireName(exact), variables);
  }
  return value.replace(embeddedVariable, (placeholder, name: string) => {
    const resolved = variableValue(name, variables);
    if (!isScalar(resolved)) {
      throw new Error(`Hook 变量 ${placeholder} 不能将数组或对象嵌入字符串`);
    }
    return String(resolved);
  });
}
function variableValue(name: string, variables: HookVariables) {
  if (name === "cwd") {
    return variables.cwd;
  }
  const output = previousToolValue(name, "output", variables);
  if (output.matched) {
    return output.value;
  }
  const structured = previousToolValue(name, "structuredOutput", variables);
  if (structured.matched) {
    return structured.value;
  }
  throw new Error(`未知 Hook 变量：\${${name}}`);
}
function previousToolValue(
  name: string,
  field: "output" | "structuredOutput",
  variables: HookVariables,
): { matched: boolean; value?: unknown } {
  const variable = `previousTool.${field}`;
  if (name !== variable && !name.startsWith(`${variable}.`)) {
    return { matched: false };
  }
  const previous = variables.previousTool;
  if (!previous) {
    throw new Error(`Hook 变量 \${${variable}} 没有可用的前序工具输出`);
  }
  if (field === "structuredOutput" && !(field in previous)) {
    throw new Error(`Hook 变量 \${${variable}} 没有可用的结构化输出`);
  }
  const path = name.slice(variable.length + 1);
  const value = previous[field];
  return {
    matched: true,
    value: path ? readPath(value, path.split("."), name) : value,
  };
}
function readPath(value: unknown, path: string[], variable: string): unknown {
  let current = value;
  for (const segment of path) {
    if (isRecord(current) && segment in current) {
      current = current[segment];
    } else if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
    } else {
      throw new Error(`Hook 变量 \${${variable}} 的字段不存在：${segment}`);
    }
  }
  return current;
}
function requireName(match: RegExpExecArray) {
  const name = match.groups?.["name"];
  if (!name) {
    throw new Error(`无效 Hook 变量：${match[0]}`);
  }
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

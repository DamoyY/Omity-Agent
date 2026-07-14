import { resolve } from "node:path";
import untildify from "untildify";

type Env = NodeJS.ProcessEnv;

export function normalizeWorkspacePath(
  input: string,
  base = process.cwd(),
  env: Env = process.env,
) {
  const stripped = stripOuterQuotes(input.trim());
  if (stripped.length === 0) {
    throw new Error("工作目录不能为空");
  }
  const expanded = expandEnvironmentVariables(stripped, env);
  return resolve(base, normalizeDriveRoot(untildify(expanded)), ".");
}

function stripOuterQuotes(value: string) {
  let current = value;
  while (current.length >= 2 && matchingQuotes(current)) {
    current = current.slice(1, -1).trim();
  }
  return current;
}

function matchingQuotes(value: string) {
  const first = value[0];
  const last = value.at(-1);
  return (
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === "`" && last === "`")
  );
}

function expandEnvironmentVariables(value: string, env: Env) {
  return expandDollarVariables(expandPercentVariables(value, env), env);
}

function expandPercentVariables(value: string, env: Env) {
  return value.replaceAll(/%([^%]+)%/g, (_, name: string) => envValue(name, env));
}

function expandDollarVariables(value: string, env: Env) {
  return value
    .replaceAll(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (_, name: string) => envValue(name, env))
    .replaceAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => envValue(name, env))
    .replaceAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => envValue(name, env));
}

function envValue(name: string, env: Env) {
  const value = env[name] ?? env[caseInsensitiveEnvName(name, env)];
  if (value === undefined) {
    throw new Error("环境变量未定义：" + name);
  }
  return value;
}

function caseInsensitiveEnvName(name: string, env: Env) {
  const lower = name.toLowerCase();
  return Object.keys(env).find((key) => key.toLowerCase() === lower) ?? name;
}

function normalizeDriveRoot(value: string) {
  if (process.platform !== "win32") return value;
  return /^[A-Za-z]:$/.test(value) ? value + "\\" : value;
}

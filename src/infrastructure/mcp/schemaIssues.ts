interface ZodIssueLike {
  code?: string;
  expected?: unknown;
  message?: string;
  path?: (string | number)[];
  received?: unknown;
  unionErrors?: { issues?: ZodIssueLike[] }[];
}

export function collectReadableZodIssues(error: unknown): string[] {
  const issues = getZodIssues(error);
  if (issues.length === 0) {
    return [];
  }
  return [...new Set(flattenBestIssues(issues).map(formatZodIssue))];
}

function getZodIssues(error: unknown): ZodIssueLike[] {
  if (isRecord(error) && Array.isArray(error["issues"])) {
    return error["issues"].filter(isZodIssueLike);
  }
  return [];
}

function flattenBestIssues(issues: ZodIssueLike[]): ZodIssueLike[] {
  return issues.flatMap((issue) => {
    if (issue.code !== "invalid_union" || issue.unionErrors === undefined) {
      return [issue];
    }
    const candidates = issue.unionErrors
      .map((unionError) => flattenBestIssues(unionError.issues ?? []))
      .filter((candidate) => candidate.length > 0);
    const best = candidates.toSorted((left, right) => left.length - right.length)[0];
    return best ?? [issue];
  });
}

function formatZodIssue(issue: ZodIssueLike): string {
  const path = formatIssuePath(issue.path);
  if (issue.path?.at(-1) === "args" && issue.expected === "array") {
    return `${path} 应为字符串数组；如无参数可省略（当前为 ${formatValue(issue.received)}）`;
  }
  if (issue.path?.at(-1) === "command" && issue.expected === "string") {
    return `${path} 应为可执行命令字符串`;
  }
  if (issue.path?.at(-1) === "url" && issue.expected === "string") {
    return `${path} 应为 HTTP/SSE MCP 服务地址`;
  }
  return `${path} ${issue.message ?? "配置无效"}`;
}

function formatIssuePath(path: (string | number)[] | undefined): string {
  if (path === undefined || path.length === 0) {
    return "settings/mcp.yaml";
  }
  return `settings/mcp.yaml.${path.join(".")}`;
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return "未填写";
  }
  return JSON.stringify(value);
}

function isZodIssueLike(value: unknown): value is ZodIssueLike {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

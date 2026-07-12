export type ErrorValue =
  | null
  | boolean
  | number
  | string
  | ErrorValue[]
  | ErrorDetails
  | { [key: string]: ErrorValue };

export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorDetails;
  details?: Record<string, ErrorValue>;
}

export function captureError(error: unknown): ErrorDetails {
  return capture(error, new WeakSet<object>());
}

export function stringifyError(error: ErrorDetails) {
  return JSON.stringify(error);
}

export function parseError(value: string): ErrorDetails {
  const parsed: unknown = JSON.parse(value);
  if (!isErrorDetails(parsed)) {
    throw new Error("队列错误详情无效");
  }
  return parsed;
}

function capture(value: unknown, seen: WeakSet<object>): ErrorDetails {
  if (!(value instanceof Error)) {
    return {
      name: errorName(value),
      message: String(value),
      details: { value: serialize(value, seen) },
    };
  }
  if (seen.has(value)) {
    return {
      name: value.name,
      message: value.message,
      details: { circular: true },
    };
  }
  seen.add(value);
  const details: Record<string, ErrorValue> = {};
  for (const key of Reflect.ownKeys(value)) {
    const label = typeof key === "symbol" ? key.toString() : key;
    if (["name", "message", "stack", "cause"].includes(label)) continue;
    details[label] = readProperty(value, key, seen);
  }
  const cause =
    "cause" in value && value.cause !== undefined
      ? capture(value.cause, seen)
      : undefined;
  return {
    name: value.name,
    message: value.message,
    ...(value.stack ? { stack: value.stack } : {}),
    ...(cause ? { cause } : {}),
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

function readProperty(
  target: object,
  key: PropertyKey,
  seen: WeakSet<object>,
): ErrorValue {
  try {
    return serialize(Reflect.get(target, key), seen);
  } catch (error) {
    return `[读取属性失败：${error instanceof Error ? error.message : String(error)}]`;
  }
}

function serialize(value: unknown, seen: WeakSet<object>): ErrorValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "function")
    return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Error) return capture(value, seen);
  if (value instanceof Headers) return Object.fromEntries(value.entries());
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => serialize(item, seen));
  const result: Record<string, ErrorValue> = {};
  for (const key of Reflect.ownKeys(value)) {
    const label = typeof key === "symbol" ? key.toString() : key;
    result[label] = readProperty(value, key, seen);
  }
  return result;
}

function errorName(value: unknown) {
  if (value === null) return "null";
  if (typeof value === "object") {
    const constructor = Reflect.get(value, "constructor") as unknown;
    return typeof constructor === "function" && constructor.name
      ? constructor.name
      : "Object";
  }
  return typeof value;
}

function isErrorDetails(value: unknown): value is ErrorDetails {
  if (!isRecord(value)) return false;
  if (
    typeof value["name"] !== "string" ||
    typeof value["message"] !== "string"
  ) {
    return false;
  }
  if (value["stack"] !== undefined && typeof value["stack"] !== "string") {
    return false;
  }
  if (value["cause"] !== undefined && !isErrorDetails(value["cause"])) {
    return false;
  }
  return value["details"] === undefined || isRecord(value["details"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { serializeError } from "serialize-error";
import { z } from "zod";

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

const errorValueSchema: z.ZodType<ErrorValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(errorValueSchema),
    z.record(z.string(), errorValueSchema),
  ]),
);

const errorDetailsSchema: z.ZodType<ErrorDetails> = z.lazy(() =>
  z.strictObject({
    name: z.string(),
    message: z.string(),
    stack: z.string().optional(),
    cause: errorDetailsSchema.optional(),
    details: z.record(z.string(), errorValueSchema).optional(),
  }),
);

export function captureError(error: unknown): ErrorDetails {
  const serializedError: unknown = serializeError(error);
  const json = JSON.stringify(serializedError);
  const serialized: unknown = JSON.parse(json);
  if (!(error instanceof Error)) {
    return errorDetailsSchema.parse({
      name: valueName(error),
      message: String(error),
      details: { value: nonErrorValue(error, serialized) },
    });
  }
  return errorDetailsSchema.parse(
    adaptSerializedError(isRecord(serialized) ? serialized : {}, error),
  );
}

export function stringifyError(error: ErrorDetails) {
  return JSON.stringify(error);
}

export function parseError(value: string): ErrorDetails {
  const parsed: unknown = JSON.parse(value);
  const result = errorDetailsSchema.safeParse(parsed);
  if (!result.success) throw new Error("队列错误详情无效");
  return result.data;
}

function adaptSerializedError(
  serialized: Record<string, unknown>,
  source?: unknown,
): ErrorDetails {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(serialized)) {
    if (["name", "message", "stack", "cause"].includes(key)) continue;
    details[key] = sourceProperty(source, key, value);
  }

  const cause = serialized["cause"];
  return {
    name:
      typeof serialized["name"] === "string"
        ? serialized["name"]
        : valueName(source),
    message:
      typeof serialized["message"] === "string"
        ? serialized["message"]
        : String(source),
    ...(typeof serialized["stack"] === "string"
      ? { stack: serialized["stack"] }
      : {}),
    ...(cause === undefined
      ? {}
      : {
          cause: adaptSerializedError(
            isRecord(cause) ? cause : serializeError(cause),
            source instanceof Error ? source.cause : undefined,
          ),
        }),
    ...(Object.keys(details).length > 0
      ? { details: details as Record<string, ErrorValue> }
      : {}),
  };
}

function sourceProperty(source: unknown, key: string, serialized: unknown) {
  if (!isRecord(source)) return serialized;
  try {
    const value = source[key];
    return value instanceof Headers
      ? Object.fromEntries(value.entries())
      : serialized;
  } catch {
    return serialized;
  }
}

function nonErrorValue(value: unknown, serialized: unknown): unknown {
  if (value === null || ["string", "boolean"].includes(typeof value)) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }
  return serialized;
}

function valueName(value: unknown) {
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  const constructor = value.constructor;
  return typeof constructor === "function" && constructor.name
    ? constructor.name
    : "Object";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import type { AttachmentSettings } from "../../../attachments/contract";
import type { ErrorDetails } from "../../../../failures/details";
import type { SessionInfo } from "../../../sessionState";
import type { TranscriptSnapshot } from "../transcript/cache";
import { z } from ".";

const integer = z.number().int();
const errorDetailsSchema: z.ZodType<ErrorDetails> = z.lazy(() =>
  z.object({
    cause: errorDetailsSchema.optional(),
    details: z.record(z.string(), z.json()).optional(),
    message: z.string(),
    name: z.string(),
    stack: z.string().optional(),
  }),
);
const sessionInfoSchema: z.ZodType<SessionInfo> = z.object({
  createdAt: integer,
  error: errorDetailsSchema.nullable(),
  id: z.string(),
  status: z.enum(["tool", "model", "idle", "paused", "error"]),
  updatedAt: integer,
  workspace: z.string(),
});
const toolCallSchema = z.object({
  id: z.string(),
  index: integer.nonnegative(),
  input: z.unknown(),
  inputText: z.string().optional(),
  inputTokens: integer.nonnegative(),
  messageId: z.string().optional(),
  name: z.string(),
  rawInput: z.string().optional(),
  streaming: z.boolean().optional(),
});
const tokenUsageSchema = z.object({
  cacheReadTokens: integer.nonnegative(),
  inputTokens: integer.nonnegative(),
  outputTokens: integer.nonnegative(),
});
const messageSchema = z.object({
  content: z.string(),
  createdAt: integer,
  id: integer.positive(),
  images: z.array(z.object({ mimeType: z.string(), src: z.string() })),
  outputTokens: integer.nonnegative().optional(),
  queueId: integer.positive().nullable(),
  reasoning: z.string(),
  role: z.enum(["user", "assistant", "tool"]),
  sourceId: z.string().optional(),
  toolCallId: z.string().optional(),
  toolCalls: z.array(toolCallSchema),
  usage: tokenUsageSchema.optional(),
});
const queueSchema = z.object({
  content: z.string(),
  error: errorDetailsSchema.nullable(),
  id: integer.positive(),
  root: z.boolean().optional(),
  status: z.enum(["draft", "pending", "running", "paused", "done", "canceled"]),
  userMessageId: integer.positive().nullable().optional(),
});
const eventSchema = z.object({ id: integer.positive(), message: z.string(), payload: z.unknown() });
export const transcriptResponseSchema: z.ZodType<TranscriptSnapshot> = z.object({
  control: z.enum(["running", "pause", "cancel", "pause_cancel"]),
  eventCursor: integer.nonnegative(),
  events: z.array(eventSchema),
  messages: z.array(messageSchema),
  queue: z.array(queueSchema),
});
const attachmentSettingsSchema: z.ZodType<AttachmentSettings> = z.object({
  allowedSuffixes: z.array(z.string()),
  maxSizeBytes: integer.nonnegative(),
});
export const bootstrapResponseSchema = z.object({
  attachments: attachmentSettingsSchema,
  cwd: z.string(),
  frontend: z.object({
    draftSaveDelayMs: integer.nonnegative(),
    transcriptRefreshIntervalMs: integer.nonnegative(),
  }),
  sessions: z.array(sessionInfoSchema),
});
export const sessionResponseSchema = z.object({ session: sessionInfoSchema });
export const deletedResponseSchema = z.object({ deleted: z.string() });
export const workspaceResponseSchema = z.object({ workspace: z.string().nullable() });
export const draftResponseSchema = z.object({
  content: z.string().nullable(),
  revision: integer.nonnegative(),
});
export const revisionResponseSchema = z.object({ revision: integer.nonnegative() });
export const messageResponseSchema = z.object({ content: z.string(), queueId: integer.positive() });
export const controlResponseSchema = z.object({
  control: z.enum(["running", "pause", "cancel"]),
});
export const cancellationResponseSchema = z.object({ toolCallId: z.string() });

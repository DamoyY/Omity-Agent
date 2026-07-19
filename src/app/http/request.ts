import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type {
  MessageSubmission,
  PendingAttachment,
  SessionSubmission,
} from "../attachments/contract";
import type { HonoRequest } from "hono/request";
import { HttpError } from "./errors";
import { safeId } from "../../infrastructure/configuration/sessionPaths";
import { z } from "zod";

export const requestBodyLimit = 1024 * 1024;
const nonEmptyMessage = z.string().refine((value) => value.trim().length > 0);
const historySchema = z.array(
  z.object({ assistant: nonEmptyMessage, user: nonEmptyMessage }).strict(),
);
const messageFieldsSchema = z.object({
  content: nonEmptyMessage,
  draftRevision: z
    .string()
    .regex(/^(?<revision>0|[1-9]\d*)$/u)
    .transform(Number)
    .pipe(z.number().int().nonnegative()),
});
const sessionFieldsSchema = z.object({
  history: historySchema,
  message: nonEmptyMessage,
  workspace: z.string().trim().min(1).max(32_767),
});
export const composerDraftBody = z
  .object({
    content: z.string(),
    revision: z.number().int().positive(),
  })
  .strict();
export const controlBody = z.object({ control: z.enum(["running", "pause", "cancel"]) }).strict();
export const cancelToolBody = z.object({ toolCallId: z.string().min(1).max(1024) }).strict();
export const forkBody = z.object({ beforeMessageId: z.number().int().positive() }).strict();
const authenticatorAttachment = z.enum(["cross-platform", "platform"]).optional();
const credentialBase = {
  authenticatorAttachment,
  clientExtensionResults: z.looseObject({}),
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
};
export const registrationBody: z.ZodType<RegistrationResponseJSON> = z.object({
  ...credentialBase,
  response: z.object({
    attestationObject: z.string().min(1),
    authenticatorData: z.string().min(1).optional(),
    clientDataJSON: z.string().min(1),
    publicKey: z.string().min(1).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    transports: z
      .array(z.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]))
      .optional(),
  }),
});
export const authenticationBody: z.ZodType<AuthenticationResponseJSON> = z.object({
  ...credentialBase,
  response: z.object({
    authenticatorData: z.string().min(1),
    clientDataJSON: z.string().min(1),
    signature: z.string().min(1),
    userHandle: z.string().optional(),
  }),
});
export const registrationOptionsBody = z.object({ ticket: z.string().min(1).optional() }).strict();
export async function readJson<T>(request: HonoRequest, schema: z.ZodType<T>): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await request.json<unknown>();
  } catch {
    throw new HttpError(400, "请求体不是有效的 JSON");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new HttpError(400, `请求参数无效：${details}`);
  }
  return result.data;
}
export async function readMessageForm(request: HonoRequest): Promise<MessageSubmission> {
  const form = await readFormData(request);
  const fields = {
    content: singleText(form, "content"),
    draftRevision: singleText(form, "draftRevision"),
  };
  const result = messageFieldsSchema.safeParse(fields);
  if (!result.success) {
    throw new HttpError(400, `消息参数无效：${result.error.message}`);
  }
  const attachments = readAttachments(form, new Set(Object.keys(fields)));
  return { ...result.data, attachments };
}
export async function readSessionForm(request: HonoRequest): Promise<SessionSubmission> {
  const form = await readFormData(request);
  const fields = {
    message: singleText(form, "message"),
    workspace: singleText(form, "workspace"),
  };
  let history: unknown;
  try {
    history = JSON.parse(singleText(form, "history")) as unknown;
  } catch {
    throw new HttpError(400, "初始历史消息不是有效的 JSON");
  }
  const result = sessionFieldsSchema.safeParse({ ...fields, history });
  if (!result.success) {
    throw new HttpError(400, `新建会话参数无效：${result.error.message}`);
  }
  const attachments = readAttachments(form, new Set(["workspace", "message", "history"]));
  return { ...result.data, attachments };
}
async function readFormData(request: HonoRequest) {
  try {
    return await request.formData();
  } catch {
    throw new HttpError(400, "请求体不是有效的 multipart/form-data");
  }
}
function readAttachments(form: FormData, fields: Set<string>) {
  return [...form.entries()].flatMap(([key, value]): PendingAttachment[] => {
    if (fields.has(key)) {
      return [];
    }
    const match = /^file:(?<id>[0-9a-z]{8})$/u.exec(key);
    if (!match || typeof value === "string") {
      throw new HttpError(400, `附件字段无效：${key}`);
    }
    const name: unknown = Reflect.get(value, "name");
    if (typeof name !== "string" || name.length === 0) {
      throw new HttpError(400, `附件缺少有效文件名：${key}`);
    }
    return [{ file: value, id: match.groups?.["id"] ?? "" }];
  });
}
function singleText(form: FormData, name: string) {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new HttpError(400, `消息字段必须是单个文本值：${name}`);
  }
  return values[0];
}
export function decodeSessionId(value: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "Session ID 编码无效");
  }
  try {
    return safeId(decoded);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error));
  }
}

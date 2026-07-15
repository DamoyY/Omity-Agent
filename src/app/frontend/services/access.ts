import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { request } from "./request";
import { z } from "zod";

const accessStatusSchema = z.object({
  authenticated: z.boolean(),
  configured: z.boolean(),
  credentialCount: z.number().int().nonnegative(),
  local: z.boolean(),
  publicOrigin: z.string().nullable(),
});
const loginOptionsSchema = z.object({
  options: z.custom<PublicKeyCredentialRequestOptionsJSON>(),
});
const registrationOptionsSchema = z.object({
  options: z.custom<PublicKeyCredentialCreationOptionsJSON>(),
  origin: z.string(),
});
const authenticatedSchema = z.object({ authenticated: z.boolean() });
const registeredSchema = z.object({
  credentialCount: z.number().int().positive(),
  verified: z.boolean(),
});
const ticketSchema = z.object({ ticket: z.string().min(1) });
export type AccessStatus = z.infer<typeof accessStatusSchema>;
export async function accessStatus() {
  return request("api/access", accessStatusSchema);
}
export async function login() {
  requireWebAuthn();
  const { options } = await request("api/access/login/options", loginOptionsSchema, {
    body: "{}",
    method: "POST",
  });
  const response = await startAuthentication({ optionsJSON: options });
  return request("api/access/login", authenticatedSchema, {
    body: JSON.stringify(response),
    method: "POST",
  });
}
export async function register(ticket?: string) {
  requireWebAuthn();
  const { options, origin } = await request(
    "api/access/register/options",
    registrationOptionsSchema,
    {
      body: JSON.stringify(ticket ? { ticket } : {}),
      method: "POST",
    },
  );
  if (origin !== globalThis.location.origin) {
    throw new Error(`请通过 ${origin} 打开 WebUI 后注册通行密钥`);
  }
  const response = await startRegistration({ optionsJSON: options });
  return request("api/access/register", registeredSchema, {
    body: JSON.stringify(response),
    method: "POST",
  });
}
export async function registrationTicket() {
  return request("api/access/register/ticket", ticketSchema, {
    body: "{}",
    method: "POST",
  });
}

export async function logout() {
  return request("api/access/logout", authenticatedSchema, {
    body: "{}",
    method: "POST",
  });
}
function requireWebAuthn() {
  if (!browserSupportsWebAuthn()) {
    throw new Error("当前浏览器或页面安全上下文不支持 WebAuthn");
  }
}

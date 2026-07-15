import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { type ClientIdentity, ClientNetwork } from "./network";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { AccessStore } from "./store";
import { HttpError } from "../http/errors";
import { type IncomingMessage } from "node:http";
import { type Settings } from "../../types";
import { WebAuthnCeremony } from "./ceremony";

export const accessSessionCookie = "__Host-omity_access";
export const accessChallengeCookie = "__Host-omity_challenge";
export interface AccessStatus {
  authenticated: boolean;
  configured: boolean;
  credentialCount: number;
  local: boolean;
  publicOrigin: string | null;
}
export class AccessService {
  private readonly network: ClientNetwork;
  private readonly store: AccessStore;
  private readonly limiter: RateLimiterMemory;
  private readonly ceremony: WebAuthnCeremony;
  constructor(private readonly settings: Settings) {
    this.network = new ClientNetwork(
      settings.access.trustedProxies,
      settings.access.publicOrigin !== null,
    );
    this.store = new AccessStore(settings.paths.dataDir);
    this.ceremony = new WebAuthnCeremony(settings, this.store);
    this.limiter = new RateLimiterMemory({
      blockDuration: Math.ceil(settings.access.loginRateLimit.windowMs / 1000),
      duration: Math.ceil(settings.access.loginRateLimit.windowMs / 1000),
      points: settings.access.loginRateLimit.attempts,
    });
  }
  get sessionTtlMs() {
    return this.settings.access.sessionTtlMs;
  }
  get challengeTtlMs() {
    return this.settings.access.challengeTtlMs;
  }
  close() {
    this.store.close();
  }
  identify(request: IncomingMessage) {
    try {
      return this.network.identify(request);
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "无法识别客户端地址",
        "BAD_REQUEST",
      );
    }
  }
  status(identity: ClientIdentity, token?: string): AccessStatus {
    return {
      authenticated: identity.local || this.store.hasSession(token),
      configured: this.settings.access.publicOrigin !== null,
      credentialCount: identity.local ? this.store.credentialCount() : 0,
      local: identity.local,
      publicOrigin: identity.local ? this.settings.access.publicOrigin : null,
    };
  }
  requireAccess(identity: ClientIdentity, token?: string) {
    if (!identity.local && !this.store.hasSession(token)) {
      throw new HttpError(401, "公网请求需要通过 WebAuthn 验证身份", "AUTH_REQUIRED");
    }
  }
  requireTrustedOrigin(
    identity: ClientIdentity,
    origin: string | undefined,
    requestOrigin: string,
  ) {
    if (!origin) {
      if (identity.local) {
        return;
      }
      throw new HttpError(403, "公网写请求缺少 Origin", "LOCAL_ONLY");
    }
    if (
      origin === this.settings.access.publicOrigin ||
      (identity.local && origin === requestOrigin)
    ) {
      return;
    }
    throw new HttpError(403, `拒绝跨站请求来源：${origin}`, "LOCAL_ONLY");
  }
  registrationTicket(identity: ClientIdentity) {
    this.requireLocal(identity);
    this.ceremony.relyingParty();
    const ticket = this.store.createRegistrationTicket(this.settings.access.challengeTtlMs);
    return { ticket };
  }
  async registrationOptions(identity: ClientIdentity, ticket?: string) {
    if (!identity.local) {
      if (!ticket) {
        throw new HttpError(403, "WebAuthn 注册链接缺失", "LOCAL_ONLY");
      }
      try {
        this.store.consumeRegistrationTicket(ticket);
      } catch {
        throw new HttpError(403, "WebAuthn 注册链接不存在或已过期", "LOCAL_ONLY");
      }
    }
    return this.ceremony.registrationOptions();
  }
  async register(challengeId: string, response: RegistrationResponseJSON) {
    return this.ceremony.register(challengeId, response);
  }
  async authenticationOptions(identity: ClientIdentity) {
    this.requirePublic(identity);
    await this.consumeRateLimit(identity, "options");
    return this.ceremony.authenticationOptions();
  }
  async authenticate(
    identity: ClientIdentity,
    challengeId: string,
    response: AuthenticationResponseJSON,
  ) {
    this.requirePublic(identity);
    await this.consumeRateLimit(identity, "verification");
    return this.ceremony.authenticate(challengeId, response);
  }
  logout(token?: string) {
    this.store.deleteSession(token);
  }
  private requireLocal(identity: ClientIdentity) {
    if (!identity.local) {
      throw new HttpError(403, "WebAuthn 凭据只能从局域网注册", "LOCAL_ONLY");
    }
  }
  private requirePublic(identity: ClientIdentity) {
    if (identity.local) {
      throw new HttpError(400, "局域网请求无需登录", "BAD_REQUEST");
    }
  }
  private async consumeRateLimit(identity: ClientIdentity, phase: string) {
    try {
      await this.limiter.consume(`${phase}:${identity.address}`);
    } catch (error) {
      if (!(error instanceof RateLimiterRes)) {
        throw error;
      }
      throw new HttpError(429, "WebAuthn 登录尝试过于频繁，请稍后再试", "RATE_LIMITED");
    }
  }
}

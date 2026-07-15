import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AccessStore } from "./store";
import { HttpError } from "../http/errors";
import type { Settings } from "../../types";

export class WebAuthnCeremony {
  constructor(
    private readonly settings: Settings,
    private readonly store: AccessStore,
  ) {}
  async registrationOptions() {
    const { origin, rpID } = this.relyingParty();
    const options = await generateRegistrationOptions({
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
      excludeCredentials: this.store.credentials().map(credentialDescriptor),
      rpID,
      rpName: "Omity",
      userDisplayName: "Omity 管理员",
      userName: "administrator",
    });
    const challengeId = this.store.createChallenge(
      "registration",
      options.challenge,
      this.settings.access.challengeTtlMs,
    );
    return { challengeId, options, origin };
  }
  async register(challengeId: string, response: RegistrationResponseJSON) {
    const challenge = this.store.consumeChallenge(challengeId, "registration");
    const { origin, rpID } = this.relyingParty();
    const verification = await invalidAsUnauthorized(() =>
      verifyRegistrationResponse({
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        response,
      }),
    );
    if (!verification.verified) {
      throw new HttpError(401, "WebAuthn 凭据注册验证失败", "AUTH_INVALID");
    }
    this.store.addCredential(verification.registrationInfo.credential);
    return {
      credentialCount: this.store.credentialCount(),
      token: this.store.createSession(this.settings.access.sessionTtlMs),
      verified: true,
    };
  }
  async authenticationOptions() {
    const credentials = this.store.credentials();
    if (credentials.length === 0) {
      throw new HttpError(503, "尚未从局域网注册 WebAuthn 凭据", "AUTH_NOT_CONFIGURED");
    }
    const options = await generateAuthenticationOptions({
      allowCredentials: credentials.map(credentialDescriptor),
      rpID: this.relyingParty().rpID,
      userVerification: "required",
    });
    const challengeId = this.store.createChallenge(
      "authentication",
      options.challenge,
      this.settings.access.challengeTtlMs,
    );
    return { challengeId, options };
  }
  async authenticate(challengeId: string, response: AuthenticationResponseJSON) {
    const challenge = this.store.consumeChallenge(challengeId, "authentication");
    const credential = this.store.credential(response.id);
    if (!credential) {
      throw new HttpError(401, "WebAuthn 凭据未知", "AUTH_INVALID");
    }
    const { origin, rpID } = this.relyingParty();
    const verification = await invalidAsUnauthorized(() =>
      verifyAuthenticationResponse({
        credential,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        response,
      }),
    );
    if (!verification.verified) {
      throw new HttpError(401, "WebAuthn 身份验证失败", "AUTH_INVALID");
    }
    this.store.updateCounter(credential.id, verification.authenticationInfo.newCounter);
    return this.store.createSession(this.settings.access.sessionTtlMs);
  }
  relyingParty() {
    const origin = this.settings.access.publicOrigin;
    if (!origin) {
      throw new HttpError(
        503,
        "请先在 settings/main.yaml 配置 access.publicOrigin",
        "AUTH_NOT_CONFIGURED",
      );
    }
    return { origin, rpID: new URL(origin).hostname };
  }
}
function credentialDescriptor(credential: ReturnType<AccessStore["credentials"]>[number]) {
  return credential.transports
    ? { id: credential.id, transports: credential.transports }
    : { id: credential.id };
}
async function invalidAsUnauthorized<T>(verify: () => Promise<T>) {
  try {
    return await verify();
  } catch {
    throw new HttpError(401, "WebAuthn 响应验证失败", "AUTH_INVALID");
  }
}

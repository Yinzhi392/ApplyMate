import { createHash } from "node:crypto";

import {
  createPreferenceFacts,
  type ApiAction,
} from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";
import {
  canDisabledUserAccessAction,
  type UserRecord,
} from "./identity-domain.js";
import type { IdentityRepository } from "./identity-repository.js";

export type IdentityNamespace =
  | "applymate-openid-v1"
  | "web-anonymous-uid-v1"
  | "web-email-uid-v1";

export function hashTrustedIdentity(
  identity: string,
  namespace: IdentityNamespace,
): string {
  return createHash("sha256")
    .update(`${namespace}\0${identity}`, "utf8")
    .digest("hex");
}

export function hashTrustedOpenId(openId: string): string {
  return hashTrustedIdentity(openId, "applymate-openid-v1");
}

export class UserService {
  constructor(private readonly repository: IdentityRepository) {}

  async getOrCreateUser(
    identity: string,
    now: Date,
    namespace: IdentityNamespace = "applymate-openid-v1",
  ): Promise<UserRecord> {
    const identityHash = hashTrustedIdentity(identity, namespace);
    return this.repository.ensureUser(identityHash, () => {
      const timestamp = now.toISOString();
      return {
        userId: `user_${identityHash.slice(0, 24)}`,
        identityHash,
        identityNamespace: namespace,
        accountStatus: "enabled",
        activationStatus:
          namespace === "web-email-uid-v1" ? "active" : "pending_invite",
        agreements: {},
        preferenceText: "",
        preferenceFacts: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
  }

  canAccessAction(user: UserRecord, action: ApiAction): boolean {
    return (
      user.accountStatus === "enabled" || canDisabledUserAccessAction(action)
    );
  }

  async updatePreferences(
    user: UserRecord,
    preferenceText: string,
    now: Date,
  ): Promise<UserRecord> {
    let preferenceFacts;
    try {
      preferenceFacts = createPreferenceFacts(preferenceText);
    } catch (error) {
      if (error instanceof RangeError) {
        throw new DomainError(
          "INVALID_REQUEST",
          "Preference text exceeds 500 visible characters.",
        );
      }
      throw error;
    }

    const updated: UserRecord = {
      ...user,
      preferenceText:
        preferenceFacts.length === 0
          ? ""
          : preferenceText.normalize("NFC").trim(),
      preferenceFacts,
      updatedAt: now.toISOString(),
    };
    await this.repository.saveUser(updated);
    return updated;
  }
}

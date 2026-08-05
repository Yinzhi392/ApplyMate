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

export function hashTrustedOpenId(openId: string): string {
  return createHash("sha256")
    .update(`applymate-openid-v1\0${openId}`, "utf8")
    .digest("hex");
}

export class UserService {
  constructor(private readonly repository: IdentityRepository) {}

  async getOrCreateUser(openId: string, now: Date): Promise<UserRecord> {
    const identityHash = hashTrustedOpenId(openId);
    return this.repository.ensureUser(identityHash, () => {
      const timestamp = now.toISOString();
      return {
        userId: `user_${identityHash.slice(0, 24)}`,
        identityHash,
        accountStatus: "enabled",
        activationStatus: "pending_invite",
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

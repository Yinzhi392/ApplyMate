import { createHash } from "node:crypto";

import { DomainError } from "./domain-error.js";
import type { InviteRecord, UserRecord } from "./identity-domain.js";
import type { IdentityRepository } from "./identity-repository.js";

const INVITE_LIFETIME_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const INVITE_CODE_PATTERN = /^[A-Z0-9-]{8,32}$/;

function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function hashInviteCode(code: string): string {
  return createHash("sha256")
    .update(`applymate-invite-v1\0${normalizeInviteCode(code)}`, "utf8")
    .digest("hex");
}

export class InviteService {
  constructor(private readonly repository: IdentityRepository) {}

  async createInvite(
    createdByUserId: string,
    plaintextCode: string,
    now: Date,
  ): Promise<InviteRecord> {
    const normalizedCode = normalizeInviteCode(plaintextCode);
    if (!INVITE_CODE_PATTERN.test(normalizedCode)) {
      throw new DomainError("INVALID_REQUEST", "Invitation code is invalid.");
    }

    const codeHash = hashInviteCode(normalizedCode);
    if ((await this.repository.getInviteByHash(codeHash)) !== null) {
      throw new DomainError("CONFLICT", "Invitation code already exists.");
    }

    const invite: InviteRecord = {
      inviteId: `invite_${codeHash.slice(0, 24)}`,
      codeHash,
      status: "active",
      createdByUserId,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + INVITE_LIFETIME_MILLISECONDS,
      ).toISOString(),
    };
    await this.repository.saveInvite(invite);
    return invite;
  }

  async activateInvite(
    user: UserRecord,
    plaintextCode: string,
    now: Date,
  ): Promise<UserRecord> {
    const normalizedCode = normalizeInviteCode(plaintextCode);
    if (!INVITE_CODE_PATTERN.test(normalizedCode)) {
      throw new DomainError(
        "INVALID_REQUEST",
        "Invitation is invalid or unavailable.",
      );
    }

    const result = await this.repository.consumeInviteAndActivateUser(
      hashInviteCode(normalizedCode),
      user.userId,
      now,
    );
    if (result === null) {
      throw new DomainError(
        "INVALID_REQUEST",
        "Invitation is invalid or unavailable.",
      );
    }
    return result.user;
  }
}

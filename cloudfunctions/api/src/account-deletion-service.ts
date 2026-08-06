import { createHash, randomBytes } from "node:crypto";

import { DomainError } from "./domain-error.js";
import type {
  DeletionConfirmationRecord,
  UserRecord,
} from "./identity-domain.js";
import type { IdentityRepository } from "./identity-repository.js";

export const DELETION_CONFIRMATION_TTL_MILLISECONDS = 10 * 60 * 1_000;
export const ACCOUNT_DELETION_DEADLINE_MILLISECONDS = 24 * 60 * 60 * 1_000;

function hashDeletionToken(token: string): string {
  return createHash("sha256")
    .update(`applymate-delete-confirmation-v1\0${token}`, "utf8")
    .digest("hex");
}

export interface DeletionConfirmationView {
  confirmationRequired: true;
  confirmationToken: string;
  expiresAt: string;
}

export class AccountDeletionService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly generateToken: () => string = () =>
      randomBytes(24).toString("base64url"),
  ) {}

  async requestConfirmation(
    user: UserRecord,
    now: Date,
  ): Promise<DeletionConfirmationView> {
    if (user.deletionStatus === "pending") {
      throw new DomainError("CONFLICT", "Account deletion is already pending.");
    }
    const token = this.generateToken();
    if (token.length < 16 || token.length > 256) {
      throw new Error("Deletion confirmation token has an invalid length.");
    }
    const tokenHash = hashDeletionToken(token);
    const confirmation: DeletionConfirmationRecord = {
      confirmationId: `delete_confirmation_${tokenHash.slice(0, 24)}`,
      userId: user.userId,
      tokenHash,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + DELETION_CONFIRMATION_TTL_MILLISECONDS,
      ).toISOString(),
    };
    await this.repository.saveDeletionConfirmation(confirmation);
    return {
      confirmationRequired: true,
      confirmationToken: token,
      expiresAt: confirmation.expiresAt,
    };
  }

  async confirm(
    user: UserRecord,
    confirmationToken: string,
    now: Date,
  ): Promise<UserRecord> {
    const deletionDeadlineAt = new Date(
      now.getTime() + ACCOUNT_DELETION_DEADLINE_MILLISECONDS,
    ).toISOString();
    const disabled = await this.repository.consumeDeletionConfirmationAndDisable(
      user.userId,
      hashDeletionToken(confirmationToken),
      now,
      deletionDeadlineAt,
    );
    if (disabled === null) {
      throw new DomainError(
        "CONFLICT",
        "Deletion confirmation is invalid or expired.",
      );
    }
    return disabled;
  }
}

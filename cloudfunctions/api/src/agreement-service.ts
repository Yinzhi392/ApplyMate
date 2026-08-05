import { DomainError } from "./domain-error.js";
import type { ApiAction } from "../../../shared/src/index.js";
import type { UserRecord } from "./identity-domain.js";
import type { IdentityRepository } from "./identity-repository.js";

export interface AgreementVersions {
  userAgreementVersion: string;
  privacyPolicyVersion: string;
}

const AGREEMENT_EXEMPT_ACTIONS = new Set<ApiAction>([
  "auth.status",
  "agreement.accept",
  "user.get",
  "user.delete",
]);

export class AgreementService {
  constructor(
    private readonly repository: IdentityRepository,
    readonly currentVersions: AgreementVersions,
  ) {}

  hasCurrentAgreements(user: UserRecord): boolean {
    return (
      user.agreements.userAgreement?.version ===
        this.currentVersions.userAgreementVersion &&
      user.agreements.privacyPolicy?.version ===
        this.currentVersions.privacyPolicyVersion
    );
  }

  assertActionAgreement(user: UserRecord, action: ApiAction): void {
    if (
      !AGREEMENT_EXEMPT_ACTIONS.has(action) &&
      !this.hasCurrentAgreements(user)
    ) {
      throw new DomainError(
        "AGREEMENT_REQUIRED",
        "Current agreements must be accepted.",
      );
    }
  }

  async acceptAgreements(
    user: UserRecord,
    acceptedVersions: AgreementVersions,
    now: Date,
  ): Promise<UserRecord> {
    if (
      acceptedVersions.userAgreementVersion !==
        this.currentVersions.userAgreementVersion ||
      acceptedVersions.privacyPolicyVersion !==
        this.currentVersions.privacyPolicyVersion
    ) {
      throw new DomainError(
        "INVALID_REQUEST",
        "Only the current agreement versions can be accepted.",
      );
    }

    const acceptedAt = now.toISOString();
    const updated: UserRecord = {
      ...user,
      agreements: {
        userAgreement: {
          version: acceptedVersions.userAgreementVersion,
          acceptedAt,
        },
        privacyPolicy: {
          version: acceptedVersions.privacyPolicyVersion,
          acceptedAt,
        },
      },
      updatedAt: acceptedAt,
    };
    await this.repository.saveUser(updated);
    return updated;
  }
}

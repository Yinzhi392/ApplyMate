import type { PreferenceFact } from "../../../shared/src/index.js";

export type AccountStatus = "enabled" | "disabled";
export type ActivationStatus = "pending_invite" | "active";
export type AgreementType = "userAgreement" | "privacyPolicy";
export type InviteStatus = "active" | "consumed" | "revoked";

export interface AgreementAcceptance {
  version: string;
  acceptedAt: string;
}

export interface UserRecord {
  userId: string;
  identityHash: string;
  identityNamespace?:
    | "applymate-openid-v1"
    | "web-anonymous-uid-v1"
    | "web-email-uid-v1";
  accountStatus: AccountStatus;
  activationStatus: ActivationStatus;
  activatedAt?: string;
  agreements: Partial<Record<AgreementType, AgreementAcceptance>>;
  preferenceText: string;
  preferenceFacts: PreferenceFact[];
  participation?: {
    firstAppOpenedAt?: string;
    lastAppOpenedAt?: string;
    firstGreetingCopiedAt?: string;
    returnedWithinSevenDaysAt?: string;
  };
  inviteAttemptState?: {
    failureTimestamps: string[];
    lockedUntil?: string;
  };
  deletionStatus?: "pending";
  deletionRequestedAt?: string;
  deletionDeadlineAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeletionConfirmationRecord {
  confirmationId: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface InviteRecord {
  inviteId: string;
  codeHash: string;
  status: InviteStatus;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  consumedByUserId?: string;
  consumedAt?: string;
  revokedAt?: string;
}

export interface UserStatusAuditRecord {
  auditId: string;
  action: "admin.userSetEnabled";
  actorUserId: string;
  targetUserId: string;
  enabled: boolean;
  reason: string;
  createdAt: string;
}

export interface InviteCreateAuditRecord {
  auditId: string;
  action: "admin.inviteCreate";
  actorUserId: string;
  targetInviteId: string;
  createdAt: string;
}

export interface InviteRevokeAuditRecord {
  auditId: string;
  action: "admin.inviteRevoke";
  actorUserId: string;
  targetInviteId: string;
  createdAt: string;
}

export type AuditRecord =
  | UserStatusAuditRecord
  | InviteCreateAuditRecord
  | InviteRevokeAuditRecord;

export interface IdentityAdminStats {
  users: {
    total: number;
    enabled: number;
    disabled: number;
    pendingDeletion: number;
  };
  invitations: {
    total: number;
    active: number;
    consumed: number;
    revoked: number;
  };
  auditEvents: number;
}

const DISABLED_ACCOUNT_ACTIONS = new Set([
  "auth.status",
  "user.get",
  "user.delete",
]);

export function canDisabledUserAccessAction(action: string): boolean {
  return DISABLED_ACCOUNT_ACTIONS.has(action);
}

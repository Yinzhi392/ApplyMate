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
  accountStatus: AccountStatus;
  activationStatus: ActivationStatus;
  agreements: Partial<Record<AgreementType, AgreementAcceptance>>;
  preferenceText: string;
  preferenceFacts: PreferenceFact[];
  createdAt: string;
  updatedAt: string;
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

export interface AuditRecord {
  auditId: string;
  action: "admin.userSetEnabled";
  actorUserId: string;
  targetUserId: string;
  enabled: boolean;
  reason: string;
  createdAt: string;
}

const DISABLED_ACCOUNT_ACTIONS = new Set([
  "auth.status",
  "user.get",
  "user.delete",
]);

export function canDisabledUserAccessAction(action: string): boolean {
  return DISABLED_ACCOUNT_ACTIONS.has(action);
}

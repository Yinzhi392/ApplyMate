import type { ServiceAccess } from "../../../shared/src/service-access";

export interface AuthStatus {
  accessState: "agreement_required" | "invite_required" | "active" | "disabled";
  accountStatus: "enabled" | "disabled";
  agreementRequired: boolean;
  currentVersions: {
    privacyPolicyVersion: string;
    userAgreementVersion: string;
  };
  inviteRequired: boolean;
  isAdmin: boolean;
  serviceAccess?: ServiceAccess;
  userId: string;
}

export interface ResumeListItem {
  isDefault: boolean;
  profile: { name?: string; facts?: Array<{ factId: string; text: string; category?: string }> };
  resumeId: string;
  status: "processing" | "awaiting_confirmation" | "confirmed" | "failed";
}

export interface ApplicationItem {
  applicationId: string;
  companyName?: string;
  greetingBody: string;
  jobTitle?: string;
  memo?: string;
  status: "not_applied" | "applied";
  updatedAt?: string;
}

export interface JobView {
  applicationId?: string;
  error?: { code?: string; message?: string; stage?: string };
  jobId: string;
  progress?: number;
  status: string;
  statusLabel?: string;
}

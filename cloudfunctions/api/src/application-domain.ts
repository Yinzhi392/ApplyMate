import type {
  GeneratedClaim,
  JobDescription,
} from "../../../shared/src/index.js";

export interface ApplicationFactSnapshot {
  factId: string;
  sourceType: string;
  text: string;
}

export interface ApplicationRecord {
  applicationId: string;
  jobId: string;
  userId: string;
  resumeId: string;
  status: "not_applied" | "applied";
  greetingBody: string;
  evidence: GeneratedClaim[];
  factSnapshot: ApplicationFactSnapshot[];
  jdSnapshot: JobDescription;
  omittedRequirements: string[];
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}


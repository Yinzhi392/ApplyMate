export interface EgressRequestAudit {
  auditVersion: string;
  capturedAt: string;
  provider: "ocr" | "tokenhub";
  destination: string;
  method: "POST";
  contentType: string | null;
  authorizationHeaderPresent: boolean;
  headerNames: string[];
  payloadByteLength: number;
  payloadSha256: string;
  containsImageContent: boolean;
  protectedMatchCount: number;
  boundaryPassed: true;
  metadata: Record<string, string>;
}

export interface EgressAuditArtifact {
  auditVersion: string;
  capturedAt: string;
  fixture: "synthetic-only";
  requests: EgressRequestAudit[];
  storesRawRequestBody: false;
  storesCredentials: false;
}

export const EGRESS_AUDIT_VERSION: string;
export function inspectOutboundRequest(input: {
  provider: "ocr" | "tokenhub";
  url: string;
  method?: string;
  headers?: Headers | Record<string, string>;
  body: unknown;
  metadata?: Record<string, string>;
  capturedAt?: string;
}): EgressRequestAudit;
export function assertSafeEgressArtifact(
  artifact: EgressAuditArtifact,
): EgressAuditArtifact;

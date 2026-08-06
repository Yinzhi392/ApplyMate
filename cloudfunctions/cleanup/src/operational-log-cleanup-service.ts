export const OPERATIONAL_LOG_RETENTION_MILLISECONDS =
  180 * 24 * 60 * 60 * 1_000;

interface AuditLogCleanupPort {
  cleanupAuditLogsBefore(cutoff: Date): Promise<number>;
}

interface ResourceLogCleanupPort {
  cleanupLogsBefore(cutoff: Date): Promise<number>;
}

interface IdempotencyCleanupPort {
  cleanupExpired(now: Date): Promise<number>;
}

export interface OperationalLogCleanupDependencies {
  identities: AuditLogCleanupPort;
  quotas: AuditLogCleanupPort;
  operations: ResourceLogCleanupPort;
  idempotency: IdempotencyCleanupPort;
}

export interface OperationalLogCleanupResult {
  identityAuditLogs: number;
  quotaAuditLogs: number;
  resourceLogs: number;
  expiredIdempotencyMappings: number;
}

export class OperationalLogCleanupService {
  constructor(
    private readonly dependencies: OperationalLogCleanupDependencies,
  ) {}

  async run(now: Date): Promise<OperationalLogCleanupResult> {
    const cutoff = new Date(
      now.getTime() - OPERATIONAL_LOG_RETENTION_MILLISECONDS,
    );
    const [
      identityAuditLogs,
      quotaAuditLogs,
      resourceLogs,
      expiredIdempotencyMappings,
    ] = await Promise.all([
      this.dependencies.identities.cleanupAuditLogsBefore(cutoff),
      this.dependencies.quotas.cleanupAuditLogsBefore(cutoff),
      this.dependencies.operations.cleanupLogsBefore(cutoff),
      this.dependencies.idempotency.cleanupExpired(now),
    ]);
    return {
      identityAuditLogs,
      quotaAuditLogs,
      resourceLogs,
      expiredIdempotencyMappings,
    };
  }
}

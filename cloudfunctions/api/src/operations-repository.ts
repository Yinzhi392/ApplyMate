import { getBeijingDateKey } from "./quota-domain.js";
import {
  RESOURCE_KINDS,
  ResourceUsageLogSchema,
  type ResourceUsageLog,
  type ResourceUsageStats,
} from "./operations-domain.js";

export interface OperationsRepository {
  recordResourceUsage(log: ResourceUsageLog): Promise<void>;
  listResourceUsage(): Promise<ResourceUsageLog[]>;
  getResourceStats(dateKey: string): Promise<ResourceUsageStats[]>;
  deleteByUserId(userId: string): Promise<number>;
  cleanupLogsBefore(cutoff: Date): Promise<number>;
}

function emptyStats(resource: ResourceUsageStats["resource"]): ResourceUsageStats {
  return {
    resource,
    calls: 0,
    units: 0,
    estimatedCostYuan: 0,
    actualCostYuan: 0,
    failures: 0,
  };
}

export class InMemoryOperationsRepository implements OperationsRepository {
  readonly #resourceLogs = new Map<string, ResourceUsageLog>();

  async recordResourceUsage(log: ResourceUsageLog): Promise<void> {
    const parsed = ResourceUsageLogSchema.parse(log);
    if (this.#resourceLogs.has(parsed.logId)) {
      throw new Error("Resource usage log identifier must be unique.");
    }
    this.#resourceLogs.set(parsed.logId, structuredClone(parsed));
  }

  async listResourceUsage(): Promise<ResourceUsageLog[]> {
    return Array.from(this.#resourceLogs.values(), (log) =>
      structuredClone(log),
    );
  }

  async getResourceStats(dateKey: string): Promise<ResourceUsageStats[]> {
    const stats = new Map(
      RESOURCE_KINDS.map((resource) => [resource, emptyStats(resource)]),
    );
    for (const log of this.#resourceLogs.values()) {
      if (getBeijingDateKey(new Date(log.createdAt)) !== dateKey) {
        continue;
      }
      const current = stats.get(log.resource)!;
      stats.set(log.resource, {
        resource: log.resource,
        calls: current.calls + 1,
        units: current.units + log.units,
        estimatedCostYuan: current.estimatedCostYuan + log.estimatedCostYuan,
        actualCostYuan: current.actualCostYuan + log.actualCostYuan,
        failures: current.failures + (log.status === "failed" ? 1 : 0),
      });
    }
    return RESOURCE_KINDS.map((resource) => structuredClone(stats.get(resource)!));
  }

  async deleteByUserId(userId: string): Promise<number> {
    let deleted = 0;
    for (const [logId, log] of this.#resourceLogs) {
      if (log.userId === userId && this.#resourceLogs.delete(logId)) {
        deleted += 1;
      }
    }
    return deleted;
  }

  async cleanupLogsBefore(cutoff: Date): Promise<number> {
    let deleted = 0;
    for (const [logId, log] of this.#resourceLogs) {
      if (
        new Date(log.createdAt).getTime() < cutoff.getTime() &&
        this.#resourceLogs.delete(logId)
      ) {
        deleted += 1;
      }
    }
    return deleted;
  }
}

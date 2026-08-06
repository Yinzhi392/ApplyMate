import type { IdentityRepository } from "./identity-repository.js";
import type { OperationsRepository } from "./operations-repository.js";
import { getBeijingDateKey } from "./quota-domain.js";
import type { QuotaRepository } from "./quota-repository.js";

export class AdminStatsService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly quotas: QuotaRepository,
    private readonly operations: OperationsRepository,
  ) {}

  async get(now: Date): Promise<Record<string, unknown>> {
    const dateKey = getBeijingDateKey(now);
    const [identity, quota, resources] = await Promise.all([
      this.identities.getAdminStats(),
      this.quotas.getAdminStats(dateKey),
      this.operations.getResourceStats(dateKey),
    ]);
    return {
      dateKey,
      users: identity.users,
      invitations: identity.invitations,
      quota: {
        users: quota.users,
        reserved: quota.reserved,
        succeeded: quota.succeeded,
        temporaryIncrease: quota.temporaryIncrease,
      },
      auditEvents: identity.auditEvents + quota.auditEvents,
      resources,
    };
  }
}

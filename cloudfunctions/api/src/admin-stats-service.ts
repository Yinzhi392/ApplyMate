import type { IdentityRepository } from "./identity-repository.js";
import type { OperationsRepository } from "./operations-repository.js";
import { getBeijingDateKey } from "./quota-domain.js";
import type { QuotaRepository } from "./quota-repository.js";
import type { ProductMetricsService } from "./product-metrics-service.js";

export class AdminStatsService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly quotas: QuotaRepository,
    private readonly operations: OperationsRepository,
    private readonly productMetrics?: ProductMetricsService,
  ) {}

  async get(now: Date): Promise<Record<string, unknown>> {
    const dateKey = getBeijingDateKey(now);
    const [identity, quota, resources, productMetrics] = await Promise.all([
      this.identities.getAdminStats(),
      this.quotas.getAdminStats(dateKey),
      this.operations.getResourceStats(dateKey),
      this.productMetrics?.get(),
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
      ...(productMetrics === undefined ? {} : { productMetrics }),
    };
  }
}

import {
  READ_API_ACTIONS,
  resolveServiceAccess,
  type ApiAction,
  type ServiceAccess,
  type ServiceSchedule,
} from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";

const READ_ONLY_ACTIONS = new Set<ApiAction>([
  ...READ_API_ACTIONS,
  "agreement.accept",
  "analytics.track",
  "user.delete",
]);
const RETIRED_ACTIONS = new Set<ApiAction>(["auth.status", "user.delete"]);
const AI_ACTIONS = new Set<ApiAction>([
  "resume.parse",
  "generation.create",
  "generation.rewrite",
]);

export interface ServiceAccessSource {
  get(now: Date): ServiceAccess;
}

export class ServiceAccessService implements ServiceAccessSource {
  constructor(
    private readonly schedule: ServiceSchedule,
    private readonly isBudgetPaused: () => boolean,
    private readonly isResourcePaused: () => boolean,
  ) {}

  get(now: Date): ServiceAccess {
    return resolveServiceAccess(this.schedule, now, {
      budgetPaused: this.isBudgetPaused(),
      resourcePaused: this.isResourcePaused(),
    });
  }

  assertActionAvailable(action: ApiAction, now: Date): ServiceAccess {
    const access = this.get(now);
    if (access.phase === "retired" && !RETIRED_ACTIONS.has(action)) {
      throw new DomainError("SERVICE_READ_ONLY", "The service data-access period has ended.");
    }
    if (access.phase === "read_only" && !READ_ONLY_ACTIONS.has(action)) {
      throw new DomainError("SERVICE_READ_ONLY", "The service is in its read-only period.");
    }
    if (AI_ACTIONS.has(action)) {
      if (access.phase !== "active") {
        throw new DomainError("SERVICE_READ_ONLY", "New AI tasks are closed.");
      }
      if (access.aiAvailability === "budget_paused") {
        throw new DomainError("MONTHLY_BUDGET_EXHAUSTED", "Monthly AI budget is paused.");
      }
      if (access.aiAvailability !== "available") {
        throw new DomainError("RESOURCE_PAUSED", "AI resources are temporarily unavailable.", true);
      }
    }
    return access;
  }
}

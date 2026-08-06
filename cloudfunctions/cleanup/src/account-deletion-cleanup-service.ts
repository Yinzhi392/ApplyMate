import { getBeijingDateKey } from "../../../shared/src/index.js";

interface PendingDeletionUser {
  userId: string;
  identityHash: string;
}

interface IdentityDeletionPort {
  listUsersPendingDeletion(): Promise<PendingDeletionUser[]>;
  deleteAccountData(userId: string): Promise<boolean>;
}

interface DeleteByUserIdPort {
  deleteByUserId(userId: string): Promise<number>;
}

interface IdempotencyDeletionPort {
  deleteForCallerKey(callerKey: string): Promise<number>;
}

export interface AnonymousAggregateRecord {
  dateKey: string;
  metric: "accounts_deleted";
  count: number;
}

export interface AnonymousAggregateRepository {
  increment(
    dateKey: string,
    metric: AnonymousAggregateRecord["metric"],
  ): Promise<void>;
  list(): Promise<AnonymousAggregateRecord[]>;
}

function aggregateKey(
  dateKey: string,
  metric: AnonymousAggregateRecord["metric"],
): string {
  return `${dateKey}\0${metric}`;
}

export class InMemoryAnonymousAggregateRepository
  implements AnonymousAggregateRepository
{
  readonly #records = new Map<string, AnonymousAggregateRecord>();

  async increment(
    dateKey: string,
    metric: AnonymousAggregateRecord["metric"],
  ): Promise<void> {
    const key = aggregateKey(dateKey, metric);
    const existing = this.#records.get(key);
    this.#records.set(key, {
      dateKey,
      metric,
      count: (existing?.count ?? 0) + 1,
    });
  }

  async list(): Promise<AnonymousAggregateRecord[]> {
    return Array.from(this.#records.values(), (record) => ({ ...record })).sort(
      (left, right) =>
        left.dateKey.localeCompare(right.dateKey) ||
        left.metric.localeCompare(right.metric),
    );
  }
}

export interface AccountDeletionCleanupDependencies {
  identities: IdentityDeletionPort;
  resumes: DeleteByUserIdPort;
  jobs: DeleteByUserIdPort;
  generations: DeleteByUserIdPort;
  rewrites: DeleteByUserIdPort;
  applications: DeleteByUserIdPort;
  feedback: DeleteByUserIdPort;
  quotas: DeleteByUserIdPort;
  files: DeleteByUserIdPort;
  operations: DeleteByUserIdPort;
  idempotency: IdempotencyDeletionPort;
  aggregates: AnonymousAggregateRepository;
}

export interface AccountDeletionCleanupResult {
  candidates: number;
  deletedAccounts: number;
}

export class AccountDeletionCleanupService {
  constructor(
    private readonly dependencies: AccountDeletionCleanupDependencies,
  ) {}

  async run(now: Date): Promise<AccountDeletionCleanupResult> {
    const candidates = await this.dependencies.identities.listUsersPendingDeletion();
    let deletedAccounts = 0;
    for (const user of candidates) {
      await this.dependencies.files.deleteByUserId(user.userId);
      await this.dependencies.operations.deleteByUserId(user.userId);
      await this.dependencies.feedback.deleteByUserId(user.userId);
      await this.dependencies.applications.deleteByUserId(user.userId);
      await this.dependencies.rewrites.deleteByUserId(user.userId);
      await this.dependencies.generations.deleteByUserId(user.userId);
      await this.dependencies.resumes.deleteByUserId(user.userId);
      await this.dependencies.jobs.deleteByUserId(user.userId);
      await this.dependencies.quotas.deleteByUserId(user.userId);
      await this.dependencies.idempotency.deleteForCallerKey(user.identityHash);

      if (await this.dependencies.identities.deleteAccountData(user.userId)) {
        deletedAccounts += 1;
        await this.dependencies.aggregates.increment(
          getBeijingDateKey(now),
          "accounts_deleted",
        );
      }
    }
    return { candidates: candidates.length, deletedAccounts };
  }
}

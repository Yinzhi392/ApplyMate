import type {
  AuditRecord,
  DeletionConfirmationRecord,
  IdentityAdminStats,
  InviteRecord,
  InviteCreateAuditRecord,
  InviteRevokeAuditRecord,
  UserStatusAuditRecord,
  UserRecord,
} from "./identity-domain.js";

export interface IdentityRepository {
  ensureUser(identityHash: string, create: () => UserRecord): Promise<UserRecord>;
  getUserByIdentityHash(identityHash: string): Promise<UserRecord | null>;
  getUserById(userId: string): Promise<UserRecord | null>;
  saveUser(user: UserRecord): Promise<void>;
  saveInvite(invite: InviteRecord): Promise<void>;
  saveInviteWithAudit(
    invite: InviteRecord,
    audit: InviteCreateAuditRecord,
  ): Promise<void>;
  getInviteByHash(codeHash: string): Promise<InviteRecord | null>;
  revokeInvite(inviteId: string, now: Date): Promise<InviteRecord | null>;
  revokeInviteWithAudit(
    inviteId: string,
    now: Date,
    audit: InviteRevokeAuditRecord,
  ): Promise<InviteRecord | null>;
  consumeInviteAndActivateUser(
    codeHash: string,
    userId: string,
    now: Date,
  ): Promise<{ invite: InviteRecord; user: UserRecord } | null>;
  isInviteActivationLocked(userId: string, now: Date): Promise<boolean>;
  recordInviteActivationFailure(
    userId: string,
    now: Date,
    windowMilliseconds: number,
    maximumFailures: number,
    lockMilliseconds: number,
  ): Promise<UserRecord | null>;
  clearInviteActivationFailures(userId: string, now: Date): Promise<void>;
  setUserEnabledWithAudit(
    targetUserId: string,
    enabled: boolean,
    audit: UserStatusAuditRecord,
  ): Promise<UserRecord | null>;
  saveDeletionConfirmation(
    confirmation: DeletionConfirmationRecord,
  ): Promise<void>;
  consumeDeletionConfirmationAndDisable(
    userId: string,
    tokenHash: string,
    now: Date,
    deletionDeadlineAt: string,
  ): Promise<UserRecord | null>;
  listUsersPendingDeletion(): Promise<UserRecord[]>;
  listUsersForMetrics(): Promise<UserRecord[]>;
  deleteAccountData(userId: string): Promise<boolean>;
  listAuditRecords(): AuditRecord[];
  getAdminStats(): Promise<IdentityAdminStats>;
  cleanupAuditLogsBefore(cutoff: Date): Promise<number>;
}

function cloneUser(user: UserRecord): UserRecord {
  return structuredClone(user);
}

function cloneInvite(invite: InviteRecord): InviteRecord {
  return structuredClone(invite);
}

function cloneAudit(audit: AuditRecord): AuditRecord {
  return structuredClone(audit);
}

function cloneDeletionConfirmation(
  confirmation: DeletionConfirmationRecord,
): DeletionConfirmationRecord {
  return structuredClone(confirmation);
}

export class InMemoryIdentityRepository implements IdentityRepository {
  readonly #usersById = new Map<string, UserRecord>();
  readonly #userIdByIdentityHash = new Map<string, string>();
  readonly #invitesById = new Map<string, InviteRecord>();
  readonly #inviteIdByCodeHash = new Map<string, string>();
  readonly #auditRecords = new Map<string, AuditRecord>();
  readonly #deletionConfirmationsByUserId = new Map<
    string,
    DeletionConfirmationRecord
  >();

  get userCount(): number {
    return this.#usersById.size;
  }

  listAuditRecords(): AuditRecord[] {
    return Array.from(this.#auditRecords.values(), cloneAudit);
  }

  async ensureUser(
    identityHash: string,
    create: () => UserRecord,
  ): Promise<UserRecord> {
    const existingUserId = this.#userIdByIdentityHash.get(identityHash);
    if (existingUserId !== undefined) {
      return cloneUser(this.#usersById.get(existingUserId)!);
    }

    const user = create();
    this.#usersById.set(user.userId, cloneUser(user));
    this.#userIdByIdentityHash.set(identityHash, user.userId);
    return cloneUser(user);
  }

  async getUserByIdentityHash(identityHash: string): Promise<UserRecord | null> {
    const userId = this.#userIdByIdentityHash.get(identityHash);
    if (userId === undefined) {
      return null;
    }
    return cloneUser(this.#usersById.get(userId)!);
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    const user = this.#usersById.get(userId);
    return user === undefined ? null : cloneUser(user);
  }

  async saveUser(user: UserRecord): Promise<void> {
    if (!this.#usersById.has(user.userId)) {
      throw new Error("Cannot save an unknown user.");
    }
    this.#usersById.set(user.userId, cloneUser(user));
  }

  async saveInvite(invite: InviteRecord): Promise<void> {
    const existingInviteId = this.#inviteIdByCodeHash.get(invite.codeHash);
    if (existingInviteId !== undefined && existingInviteId !== invite.inviteId) {
      throw new Error("Invitation code hash must be unique.");
    }
    this.#invitesById.set(invite.inviteId, cloneInvite(invite));
    this.#inviteIdByCodeHash.set(invite.codeHash, invite.inviteId);
  }

  async saveInviteWithAudit(
    invite: InviteRecord,
    audit: InviteCreateAuditRecord,
  ): Promise<void> {
    if (this.#auditRecords.has(audit.auditId)) {
      throw new Error("Audit identifier must be unique.");
    }
    await this.saveInvite(invite);
    this.#auditRecords.set(audit.auditId, cloneAudit(audit));
  }

  async getInviteByHash(codeHash: string): Promise<InviteRecord | null> {
    const inviteId = this.#inviteIdByCodeHash.get(codeHash);
    if (inviteId === undefined) {
      return null;
    }
    return cloneInvite(this.#invitesById.get(inviteId)!);
  }

  async revokeInvite(
    inviteId: string,
    now: Date,
  ): Promise<InviteRecord | null> {
    const invite = this.#invitesById.get(inviteId);
    if (invite === undefined || invite.status !== "active") {
      return null;
    }

    const revoked: InviteRecord = {
      ...invite,
      status: "revoked",
      revokedAt: now.toISOString(),
    };
    this.#invitesById.set(inviteId, revoked);
    return cloneInvite(revoked);
  }

  async revokeInviteWithAudit(
    inviteId: string,
    now: Date,
    audit: InviteRevokeAuditRecord,
  ): Promise<InviteRecord | null> {
    if (this.#auditRecords.has(audit.auditId)) {
      throw new Error("Audit identifier must be unique.");
    }
    const revoked = await this.revokeInvite(inviteId, now);
    if (revoked === null) {
      return null;
    }
    this.#auditRecords.set(audit.auditId, cloneAudit(audit));
    return revoked;
  }

  async consumeInviteAndActivateUser(
    codeHash: string,
    userId: string,
    now: Date,
  ): Promise<{ invite: InviteRecord; user: UserRecord } | null> {
    const inviteId = this.#inviteIdByCodeHash.get(codeHash);
    const invite =
      inviteId === undefined ? undefined : this.#invitesById.get(inviteId);
    const user = this.#usersById.get(userId);
    if (
      invite === undefined ||
      invite.status !== "active" ||
      new Date(invite.expiresAt).getTime() <= now.getTime() ||
      user === undefined ||
      user.activationStatus !== "pending_invite" ||
      user.accountStatus !== "enabled"
    ) {
      return null;
    }

    const timestamp = now.toISOString();
    const consumed: InviteRecord = {
      ...invite,
      status: "consumed",
      consumedByUserId: userId,
      consumedAt: timestamp,
    };
    const activated: UserRecord = {
      ...user,
      activationStatus: "active",
      activatedAt: timestamp,
      updatedAt: timestamp,
    };
    this.#invitesById.set(invite.inviteId, consumed);
    this.#usersById.set(userId, activated);
    return {
      invite: cloneInvite(consumed),
      user: cloneUser(activated),
    };
  }

  async isInviteActivationLocked(userId: string, now: Date): Promise<boolean> {
    const user = this.#usersById.get(userId);
    const lockedUntil = user?.inviteAttemptState?.lockedUntil;
    return lockedUntil !== undefined && new Date(lockedUntil).getTime() > now.getTime();
  }

  async recordInviteActivationFailure(
    userId: string,
    now: Date,
    windowMilliseconds: number,
    maximumFailures: number,
    lockMilliseconds: number,
  ): Promise<UserRecord | null> {
    const user = this.#usersById.get(userId);
    if (user === undefined) {
      return null;
    }
    const cutoff = now.getTime() - windowMilliseconds;
    const failureTimestamps = [
      ...(user.inviteAttemptState?.failureTimestamps ?? []).filter(
        (timestamp) => new Date(timestamp).getTime() > cutoff,
      ),
      now.toISOString(),
    ];
    const lockedUntil =
      failureTimestamps.length >= maximumFailures
        ? new Date(now.getTime() + lockMilliseconds).toISOString()
        : undefined;
    const updated: UserRecord = {
      ...user,
      inviteAttemptState: {
        failureTimestamps,
        ...(lockedUntil === undefined ? {} : { lockedUntil }),
      },
      updatedAt: now.toISOString(),
    };
    this.#usersById.set(userId, updated);
    return cloneUser(updated);
  }

  async clearInviteActivationFailures(userId: string, now: Date): Promise<void> {
    const user = this.#usersById.get(userId);
    if (user === undefined || user.inviteAttemptState === undefined) {
      return;
    }
    const updated = { ...user, updatedAt: now.toISOString() };
    delete updated.inviteAttemptState;
    this.#usersById.set(userId, updated);
  }

  async setUserEnabledWithAudit(
    targetUserId: string,
    enabled: boolean,
    audit: UserStatusAuditRecord,
  ): Promise<UserRecord | null> {
    const user = this.#usersById.get(targetUserId);
    if (user === undefined) {
      return null;
    }
    if (this.#auditRecords.has(audit.auditId)) {
      throw new Error("Audit identifier must be unique.");
    }

    const updated: UserRecord = {
      ...user,
      accountStatus: enabled ? "enabled" : "disabled",
      updatedAt: audit.createdAt,
    };
    this.#usersById.set(targetUserId, updated);
    this.#auditRecords.set(audit.auditId, cloneAudit(audit));
    return cloneUser(updated);
  }

  async saveDeletionConfirmation(
    confirmation: DeletionConfirmationRecord,
  ): Promise<void> {
    if (!this.#usersById.has(confirmation.userId)) {
      throw new Error("Cannot create a deletion confirmation for an unknown user.");
    }
    this.#deletionConfirmationsByUserId.set(
      confirmation.userId,
      cloneDeletionConfirmation(confirmation),
    );
  }

  async consumeDeletionConfirmationAndDisable(
    userId: string,
    tokenHash: string,
    now: Date,
    deletionDeadlineAt: string,
  ): Promise<UserRecord | null> {
    const user = this.#usersById.get(userId);
    const confirmation = this.#deletionConfirmationsByUserId.get(userId);
    if (
      user === undefined ||
      user.deletionStatus === "pending" ||
      confirmation === undefined ||
      confirmation.tokenHash !== tokenHash ||
      confirmation.consumedAt !== undefined ||
      new Date(confirmation.expiresAt).getTime() <= now.getTime()
    ) {
      return null;
    }

    const timestamp = now.toISOString();
    const disabled: UserRecord = {
      ...user,
      accountStatus: "disabled",
      deletionStatus: "pending",
      deletionRequestedAt: timestamp,
      deletionDeadlineAt,
      updatedAt: timestamp,
    };
    this.#usersById.set(userId, disabled);
    this.#deletionConfirmationsByUserId.set(userId, {
      ...confirmation,
      consumedAt: timestamp,
    });
    return cloneUser(disabled);
  }

  async listUsersPendingDeletion(): Promise<UserRecord[]> {
    return Array.from(this.#usersById.values())
      .filter((user) => user.deletionStatus === "pending")
      .map(cloneUser);
  }

  async listUsersForMetrics(): Promise<UserRecord[]> {
    return Array.from(this.#usersById.values(), cloneUser);
  }

  async deleteAccountData(userId: string): Promise<boolean> {
    const user = this.#usersById.get(userId);
    if (user === undefined || user.deletionStatus !== "pending") {
      return false;
    }
    for (const [inviteId, invite] of this.#invitesById) {
      if (
        invite.createdByUserId === userId ||
        invite.consumedByUserId === userId
      ) {
        this.#invitesById.delete(inviteId);
        this.#inviteIdByCodeHash.delete(invite.codeHash);
      }
    }
    for (const [auditId, audit] of this.#auditRecords) {
      if (
        audit.actorUserId === userId ||
        ("targetUserId" in audit && audit.targetUserId === userId)
      ) {
        this.#auditRecords.delete(auditId);
      }
    }
    this.#deletionConfirmationsByUserId.delete(userId);
    this.#userIdByIdentityHash.delete(user.identityHash);
    return this.#usersById.delete(userId);
  }

  async getAdminStats(): Promise<IdentityAdminStats> {
    const users = Array.from(this.#usersById.values());
    const invitations = Array.from(this.#invitesById.values());
    return {
      users: {
        total: users.length,
        enabled: users.filter(({ accountStatus }) => accountStatus === "enabled")
          .length,
        disabled: users.filter(({ accountStatus }) => accountStatus === "disabled")
          .length,
        pendingDeletion: users.filter(
          ({ deletionStatus }) => deletionStatus === "pending",
        ).length,
      },
      invitations: {
        total: invitations.length,
        active: invitations.filter(({ status }) => status === "active").length,
        consumed: invitations.filter(({ status }) => status === "consumed").length,
        revoked: invitations.filter(({ status }) => status === "revoked").length,
      },
      auditEvents: this.#auditRecords.size,
    };
  }

  async cleanupAuditLogsBefore(cutoff: Date): Promise<number> {
    let deleted = 0;
    for (const [auditId, audit] of this.#auditRecords) {
      if (
        new Date(audit.createdAt).getTime() < cutoff.getTime() &&
        this.#auditRecords.delete(auditId)
      ) {
        deleted += 1;
      }
    }
    return deleted;
  }
}

import type {
  AuditRecord,
  InviteRecord,
  UserRecord,
} from "./identity-domain.js";

export interface IdentityRepository {
  ensureUser(identityHash: string, create: () => UserRecord): Promise<UserRecord>;
  getUserByIdentityHash(identityHash: string): Promise<UserRecord | null>;
  getUserById(userId: string): Promise<UserRecord | null>;
  saveUser(user: UserRecord): Promise<void>;
  saveInvite(invite: InviteRecord): Promise<void>;
  getInviteByHash(codeHash: string): Promise<InviteRecord | null>;
  revokeInvite(inviteId: string, now: Date): Promise<InviteRecord | null>;
  consumeInviteAndActivateUser(
    codeHash: string,
    userId: string,
    now: Date,
  ): Promise<{ invite: InviteRecord; user: UserRecord } | null>;
  setUserEnabledWithAudit(
    targetUserId: string,
    enabled: boolean,
    audit: AuditRecord,
  ): Promise<UserRecord | null>;
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

export class InMemoryIdentityRepository implements IdentityRepository {
  readonly #usersById = new Map<string, UserRecord>();
  readonly #userIdByIdentityHash = new Map<string, string>();
  readonly #invitesById = new Map<string, InviteRecord>();
  readonly #inviteIdByCodeHash = new Map<string, string>();
  readonly #auditRecords = new Map<string, AuditRecord>();

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
      updatedAt: timestamp,
    };
    this.#invitesById.set(invite.inviteId, consumed);
    this.#usersById.set(userId, activated);
    return {
      invite: cloneInvite(consumed),
      user: cloneUser(activated),
    };
  }

  async setUserEnabledWithAudit(
    targetUserId: string,
    enabled: boolean,
    audit: AuditRecord,
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
}

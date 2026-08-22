"use strict";

const { createHash, timingSafeEqual } = require("node:crypto");
const {
  addDocument,
  addIfAbsent,
  findMany,
  findOne,
  updateDocument,
} = require("./cloudbase-document-store");
const { CloudBaseJobRepository } = require("./cloudbase-job-repository");
const { createExperienceApiHandler } = require("./experience-api");

const CURRENT_VERSIONS = Object.freeze({
  userAgreementVersion: "user-2026-08-09",
  privacyPolicyVersion: "privacy-2026-08-09",
});
const BOOTSTRAP_RECORD_TYPE = "admin_bootstrap";
const INVITE_RECORD_TYPE = "invite";
const INVITE_AUDIT_RECORD_TYPE = "invite_audit";
const INVITE_FAILURE_WINDOW_MILLISECONDS = 15 * 60 * 1000;
const INVITE_LOCK_MILLISECONDS = 15 * 60 * 1000;
const INVITE_LIFETIME_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;
const MAXIMUM_INVITE_FAILURES = 5;
const INVITE_CODE_PATTERN = /^[A-Z0-9-]{8,32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_ID_PATTERN = /^job_[A-Za-z0-9_-]{8,80}$/u;
const RELIABILITY_PROBE_KIND = "reliability_probe";
const SYNTHETIC_DELETION_COLLECTIONS = Object.freeze([
  "users", "invites", "resumes", "applications", "ai_jobs", "daily_usage", "feedback", "audit_logs",
]);
const JOB_STATUS_LABELS = Object.freeze({
  queued: "排队",
  ocr: "OCR",
  parsing: "解析",
  awaiting_user_confirmation: "等待用户确认",
  generating: "生成",
  validating: "校验",
  succeeded: "成功",
  failed: "失败",
});
const CLIENT_IDENTITY_FIELDS = new Set([
  "uid", "UID", "openId", "openid", "OPENID", "userId", "customUserId", "identityHash",
]);

function hashValue(domain, value) {
  return createHash("sha256").update(`${domain}\0${value}`, "utf8").digest("hex");
}

function hashTrustedOpenId(openId) {
  return hashValue("applymate-openid-v1", openId);
}

function hashTrustedIdentity(identity, namespace) {
  return hashValue(namespace, identity);
}

function hashInviteCode(code) {
  return hashValue("applymate-invite-v1", code.trim().toUpperCase());
}

function hashBootstrapToken(token) {
  return hashValue("applymate-admin-bootstrap-v1", token);
}

function paused() {
  return {
    ok: false,
    error: {
      code: "RESOURCE_PAUSED",
      message: "This production capability is not enabled yet.",
      retryable: true,
    },
  };
}

function failure(code, message, retryable = false) {
  return { ok: false, error: { code, message, retryable } };
}

function unauthenticated() {
  return failure("UNAUTHENTICATED", "Authentication required.");
}

function invalidRequest() {
  return failure("INVALID_REQUEST", "Invalid request.");
}

function forbidden() {
  return failure("FORBIDDEN", "Access denied.");
}

function genericInviteFailure() {
  return failure("INVALID_REQUEST", "Invitation is invalid or unavailable.");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripClientIdentity(value) {
  if (Array.isArray(value)) return value.map(stripClientIdentity);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !CLIENT_IDENTITY_FIELDS.has(key))
      .map(([key, item]) => [key, stripClientIdentity(item)]),
  );
}

function decodeJobResult(value) {
  let result;
  try {
    result = typeof value === "string" ? JSON.parse(value) : clone(value);
  } catch {
    return {};
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) return {};
  if (typeof result?.profile !== "string") return result;
  try {
    const profile = JSON.parse(result.profile);
    return profile && typeof profile === "object" && !Array.isArray(profile)
      ? { ...result, profile }
      : result;
  } catch {
    return result;
  }
}

function createUser(identityHash, identityNamespace, now) {
  return {
    _id: `user_${identityHash.slice(0, 24)}`,
    recordType: "user",
    userId: `user_${identityHash.slice(0, 24)}`,
    identityHash,
    identityNamespace,
    roles: [],
    accountStatus: "enabled",
    activationStatus: "pending_invite",
    agreements: {},
    preferenceText: "",
    preferenceFacts: [],
    createdAt: now,
    updatedAt: now,
  };
}

function isAdmin(user) {
  return Array.isArray(user.roles) && user.roles.includes("admin");
}

function safeUser(user, experienceEnabled = false, remainingQuota = 20) {
  return {
    userId: user.userId,
    accountStatus: user.accountStatus,
    activationStatus: user.activationStatus,
    agreements: clone(user.agreements || {}),
    preferenceText: user.preferenceText || "",
    preferenceFacts: clone(user.preferenceFacts || []),
    isAdmin: isAdmin(user),
    remainingQuota,
    resourcePauseReason: experienceEnabled ? "" : "OCR、模型与任务处理尚未启用",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function accessState(user) {
  if (user.accountStatus === "disabled") {
    return "disabled";
  }
  const agreements = user.agreements || {};
  if (
    agreements.userAgreement?.version !== CURRENT_VERSIONS.userAgreementVersion ||
    agreements.privacyPolicy?.version !== CURRENT_VERSIONS.privacyPolicyVersion
  ) {
    return "agreement_required";
  }
  return isAdmin(user) || user.activationStatus === "active" ? "active" : "invite_required";
}

function isAgreementPayload(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    payload.userAgreementVersion === CURRENT_VERSIONS.userAgreementVersion &&
    payload.privacyPolicyVersion === CURRENT_VERSIONS.privacyPolicyVersion
  );
}

function isEmptyPayload(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 0;
}

function hasWriteRequestId(event) {
  return typeof event.requestId === "string" && UUID_PATTERN.test(event.requestId);
}

function normalizeInviteCode(code) {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}

function constantTimeHashEquals(expectedHash, candidateHash) {
  if (
    typeof expectedHash !== "string" ||
    !/^[a-f0-9]{64}$/i.test(expectedHash) ||
    typeof candidateHash !== "string" ||
    candidateHash.length !== expectedHash.length
  ) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(candidateHash, "hex"));
}

function timestampAfter(now, milliseconds) {
  return new Date(now.getTime() + milliseconds).toISOString();
}

function beijingDateKey(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

function canUseInvite(user) {
  return user.accountStatus === "enabled" && accessState(user) !== "agreement_required";
}

function createLiveApiHandler({
  database,
  dispatchExperienceJob = async () => paused(),
  experienceEnabled = false,
  dispatchReliabilityProbe = async () => undefined,
  readTrustedIdentity,
  readTrustedOpenId,
  readBootstrapTokenHash = () => process.env.APPLYMATE_ADMIN_BOOTSTRAP_TOKEN_SHA256,
  now = () => new Date(),
}) {
  return async (event) => {
    const resolvedIdentity = typeof readTrustedIdentity === "function"
      ? await readTrustedIdentity()
      : typeof readTrustedOpenId === "function"
        ? await readTrustedOpenId()
        : null;
    const trustedIdentity = typeof resolvedIdentity === "string"
      ? { value: resolvedIdentity, namespace: "applymate-openid-v1" }
      : resolvedIdentity;
    if (
      !trustedIdentity ||
      typeof trustedIdentity.value !== "string" ||
      trustedIdentity.value.trim() === "" ||
      !["applymate-openid-v1", "web-anonymous-uid-v1"].includes(trustedIdentity.namespace)
    ) {
      return unauthenticated();
    }
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return invalidRequest();
    }
    event = stripClientIdentity(event);

    const users = database.collection("users");
    const invites = database.collection("invites");
    const auditLogs = database.collection("audit_logs");
    const dailyUsage = database.collection("daily_usage");
    const applications = database.collection("applications");
    const jobs = new CloudBaseJobRepository(database.collection("ai_jobs"));
    const identityHash = hashTrustedIdentity(
      trustedIdentity.value,
      trustedIdentity.namespace,
    );
    const timestamp = now().toISOString();
    let user = await findOne(users, { recordType: "user", identityHash });
    if (user === null) {
      user = createUser(identityHash, trustedIdentity.namespace, timestamp);
      await addDocument(users, user);
    } else if (user.identityNamespace !== trustedIdentity.namespace) {
      user = { ...user, identityNamespace: trustedIdentity.namespace, updatedAt: timestamp };
      await updateDocument(users.doc(user._id), {
        identityNamespace: trustedIdentity.namespace,
        updatedAt: timestamp,
      });
    }

    if (event.action === "auth.status") {
      if (!isEmptyPayload(event.payload)) {
        return invalidRequest();
      }
      const state = accessState(user);
      return {
        ok: true,
        data: {
          userId: user.userId,
          accountStatus: user.accountStatus,
          accessState: state,
          isAdmin: isAdmin(user),
          agreementRequired: state === "agreement_required",
          inviteRequired: state === "invite_required",
          currentVersions: CURRENT_VERSIONS,
        },
      };
    }

    if (event.action === "agreement.accept") {
      if (!isAgreementPayload(event.payload)) {
        return invalidRequest();
      }
      if (user.accountStatus !== "enabled") {
        return forbidden();
      }
      user = {
        ...user,
        agreements: {
          userAgreement: { version: CURRENT_VERSIONS.userAgreementVersion, acceptedAt: timestamp },
          privacyPolicy: { version: CURRENT_VERSIONS.privacyPolicyVersion, acceptedAt: timestamp },
        },
        updatedAt: timestamp,
      };
      await updateDocument(users.doc(user._id), { agreements: user.agreements, updatedAt: timestamp });
      return { ok: true, data: { accepted: true, accessState: accessState(user) } };
    }

    if (event.action === "user.get") {
      if (!isEmptyPayload(event.payload)) {
        return invalidRequest();
      }
      if (user.accountStatus !== "enabled" || accessState(user) !== "active") {
        return forbidden();
      }
      const dateKey = beijingDateKey(now());
      const usedSlots = await findMany(dailyUsage, {
        recordType: "web_jd_quota_slot",
        userId: user.userId,
        dateKey,
      }, 40);
      const dailyLimit = 20 + Math.max(0, Number(user.dailyQuotaAdjustments?.[dateKey] || 0));
      return {
        ok: true,
        data: {
          accessState: accessState(user),
          user: safeUser(user, experienceEnabled, Math.max(0, dailyLimit - usedSlots.length)),
        },
      };
    }

    if (event.action === "user.delete") {
      if (!hasWriteRequestId(event) || !event.payload || typeof event.payload !== "object") {
        return invalidRequest();
      }
      if (event.payload.operation === "request") {
        const confirmationToken = `delete_${hashValue(
          "applymate-web-delete-token-v1",
          `${identityHash}:${event.requestId}:${timestamp}`,
        )}`;
        const confirmationHash = hashValue("applymate-web-delete-confirmation-v1", confirmationToken);
        await updateDocument(users.doc(user._id), {
          deletionConfirmationHash: confirmationHash,
          deletionConfirmationExpiresAt: timestampAfter(now(), 10 * 60 * 1000),
          updatedAt: timestamp,
        });
        return { ok: true, data: { confirmationToken } };
      }
      if (
        event.payload.operation !== "confirm" ||
        typeof event.payload.confirmationToken !== "string" ||
        typeof user.deletionConfirmationHash !== "string" ||
        typeof user.deletionConfirmationExpiresAt !== "string" ||
        new Date(user.deletionConfirmationExpiresAt).getTime() <= now().getTime() ||
        !constantTimeHashEquals(
          user.deletionConfirmationHash,
          hashValue("applymate-web-delete-confirmation-v1", event.payload.confirmationToken),
        )
      ) {
        return invalidRequest();
      }
      await updateDocument(users.doc(user._id), {
        accountStatus: "disabled",
        deletionStatus: "pending",
        deletionRequestedAt: timestamp,
        deletionDueAt: timestampAfter(now(), 24 * 60 * 60 * 1000),
        deletionConfirmationHash: null,
        deletionConfirmationExpiresAt: null,
        updatedAt: timestamp,
      });
      await addIfAbsent(auditLogs, {
        _id: `audit_${hashValue("applymate-web-delete-audit-v1", `${user.userId}:${event.requestId}`).slice(0, 24)}`,
        recordType: "account_deletion_audit",
        action: "user.delete",
        actorUserId: user.userId,
        createdAt: timestamp,
      });
      return { ok: true, data: { disabled: true, deleteWithinHours: 24 } };
    }

    if (event.action === "job.get") {
      const jobId = event.payload?.jobId;
      if (
        !event.payload ||
        typeof event.payload !== "object" ||
        Array.isArray(event.payload) ||
        Object.keys(event.payload).length !== 1 ||
        typeof jobId !== "string" ||
        !JOB_ID_PATTERN.test(jobId)
      ) {
        return invalidRequest();
      }
      if (user.accountStatus !== "enabled" || accessState(user) !== "active") {
        return forbidden();
      }
      const job = await jobs.getJobById(jobId);
      if (job === null || job.userId !== user.userId) {
        return failure("NOT_FOUND", "Job was not found.");
      }
      const result = job.result === undefined ? undefined : decodeJobResult(job.result);
      const applicationId = typeof result?.applicationId === "string" ? result.applicationId : "";
      const application = job.status === "succeeded" && applicationId !== ""
        ? await findOne(applications, {
            recordType: "application",
            applicationId,
            userId: user.userId,
          })
        : null;
      const resultPreview = application === null
        ? undefined
        : {
            applicationId,
            greetingBody: String(application.greetingBody || ""),
            jobTitle: String(application.jdSnapshot?.jobTitle?.text || "该岗位"),
            companyName: String(application.jdSnapshot?.companyName?.text || "贵司"),
            ...(application.generationDisclosure === undefined
              ? {}
              : {
                  generationDisclosure: {
                    availability: "available",
                    ...clone(application.generationDisclosure),
                    message: "内容由已公示的 AI 服务生成",
                  },
                }),
          };
      return {
        ok: true,
        data: {
          jobId: job.jobId,
          kind: job.kind,
          status: job.status,
          statusLabel: JOB_STATUS_LABELS[job.status],
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          ...(job.processingMetrics === undefined
            ? {}
            : { processingMetrics: clone(job.processingMetrics) }),
          ...(result === undefined ? {} : { result }),
          ...(resultPreview === undefined ? {} : { resultPreview }),
          ...(job.error === undefined ? {} : { error: clone(job.error) }),
        },
      };
    }

    if (experienceEnabled) {
      const experienceResult = await createExperienceApiHandler({
        database,
        dispatchExperienceJob,
        accessState,
        now,
      })({ event, user });
      if (experienceResult !== null) {
        return experienceResult;
      }
    }

    if (event.action === "admin.reliabilityProbeCreate") {
      const scenario = event.payload?.scenario;
      if (
        !event.payload ||
        typeof event.payload !== "object" ||
        Array.isArray(event.payload) ||
        Object.keys(event.payload).length !== 1 ||
        !["success", "stale"].includes(scenario) ||
        !hasWriteRequestId(event)
      ) {
        return invalidRequest();
      }
      if (user.accountStatus !== "enabled" || accessState(user) !== "active" || !isAdmin(user)) {
        return forbidden();
      }
      const probeHash = hashValue(
        "applymate-reliability-probe-v1",
        `${user.userId}:${event.requestId}:${scenario}`,
      );
      const jobId = `job_probe_${probeHash.slice(0, 24)}`;
      const createdAt = scenario === "stale"
        ? new Date(now().getTime() - 11 * 60 * 1000).toISOString()
        : timestamp;
      const job = {
        jobId,
        userId: user.userId,
        kind: RELIABILITY_PROBE_KIND,
        status: "queued",
        statusHistory: [{ status: "queued", enteredAt: createdAt }],
        syntheticTest: true,
        scenario,
        createdAt,
        updatedAt: createdAt,
      };
      const existing = await jobs.getJobById(jobId);
      if (existing === null) {
        await jobs.createJob(job);
        await addIfAbsent(dailyUsage, {
          _id: `probe_usage_${probeHash.slice(0, 24)}`,
          recordType: "reliability_probe_usage",
          jobId,
          userId: user.userId,
          syntheticTest: true,
          reserved: 1,
          succeeded: 0,
          createdAt,
          updatedAt: createdAt,
        });
      }
      if (scenario === "success") {
        await dispatchReliabilityProbe(jobId);
      }
      return { ok: true, data: { jobId, scenario, dispatched: scenario === "success" } };
    }

    if (event.action === "admin.syntheticDeletionProbeCreate") {
      if (!isEmptyPayload(event.payload) || !hasWriteRequestId(event)) {
        return invalidRequest();
      }
      if (user.accountStatus !== "enabled" || accessState(user) !== "active" || !isAdmin(user)) {
        return forbidden();
      }
      const probeHash = hashValue(
        "applymate-synthetic-deletion-probe-v1",
        `${user.userId}:${event.requestId}`,
      );
      const probeId = `delete_probe_${probeHash.slice(0, 24)}`;
      const syntheticUserId = `user_delete_probe_${probeHash.slice(0, 24)}`;
      for (const collectionName of SYNTHETIC_DELETION_COLLECTIONS) {
        await addIfAbsent(database.collection(collectionName), {
          _id: `${probeId}_${collectionName}`,
          recordType: "synthetic_deletion_probe",
          deletionProbeId: probeId,
          userId: syntheticUserId,
          syntheticTest: true,
          collectionName,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      return {
        ok: true,
        data: { probeId, seededCollections: SYNTHETIC_DELETION_COLLECTIONS.length },
      };
    }

    if (event.action === "admin.bootstrap") {
      const token = event.payload && typeof event.payload === "object" ? event.payload.token : undefined;
      if (typeof token !== "string" || token.length < 24 || token.length > 256 || !hasWriteRequestId(event)) {
        return invalidRequest();
      }
      if (user.accountStatus !== "enabled" || accessState(user) === "agreement_required") {
        return forbidden();
      }
      if (!constantTimeHashEquals(readBootstrapTokenHash(), hashBootstrapToken(token))) {
        return forbidden();
      }
      let bootstrap = await findOne(auditLogs, { recordType: BOOTSTRAP_RECORD_TYPE });
      if (bootstrap === null) {
        const created = await addIfAbsent(auditLogs, {
          _id: `bootstrap_${hashValue("applymate-bootstrap-record-v1", "singleton").slice(0, 24)}`,
          recordType: BOOTSTRAP_RECORD_TYPE,
          ownerIdentityHash: identityHash,
          requestId: event.requestId,
          createdAt: timestamp,
        });
        if (!created) {
          bootstrap = await findOne(auditLogs, { recordType: BOOTSTRAP_RECORD_TYPE });
        } else {
          bootstrap = { ownerIdentityHash: identityHash };
        }
      }
      if (bootstrap?.ownerIdentityHash !== identityHash) {
        return forbidden();
      }
      if (!isAdmin(user)) {
        user = { ...user, roles: ["admin"], updatedAt: timestamp };
        await updateDocument(users.doc(user._id), { roles: user.roles, updatedAt: timestamp });
      }
      return { ok: true, data: { bootstrapped: true, isAdmin: true } };
    }

    if (event.action === "admin.inviteCreate") {
      if (!isEmptyPayload(event.payload) || !hasWriteRequestId(event)) {
        return invalidRequest();
      }
      if (user.accountStatus !== "enabled" || accessState(user) !== "active" || !isAdmin(user)) {
        return forbidden();
      }
      const code = `AM-${hashValue("applymate-invite-code-v1", `${user.userId}:${event.requestId}`).slice(0, 16).toUpperCase()}`;
      const codeHash = hashInviteCode(code);
      const inviteId = `invite_${codeHash.slice(0, 24)}`;
      let invite = await findOne(invites, { recordType: INVITE_RECORD_TYPE, codeHash });
      if (invite === null) {
        const created = await addIfAbsent(invites, {
          _id: inviteId,
          recordType: INVITE_RECORD_TYPE,
          inviteId,
          codeHash,
          status: "active",
          createdByUserId: user.userId,
          createdAt: timestamp,
          expiresAt: timestampAfter(now(), INVITE_LIFETIME_MILLISECONDS),
        });
        invite = created
          ? await findOne(invites, { recordType: INVITE_RECORD_TYPE, codeHash })
          : await findOne(invites, { recordType: INVITE_RECORD_TYPE, codeHash });
      }
      if (invite === null || invite.createdByUserId !== user.userId) {
        return failure("CONFLICT", "Invitation could not be created.", true);
      }
      await addIfAbsent(auditLogs, {
        _id: `audit_${hashValue("applymate-invite-audit-v1", `${user.userId}:${event.requestId}`).slice(0, 24)}`,
        recordType: INVITE_AUDIT_RECORD_TYPE,
        action: "admin.inviteCreate",
        actorUserId: user.userId,
        targetInviteId: invite.inviteId,
        createdAt: timestamp,
      });
      return { ok: true, data: { inviteId: invite.inviteId, code, expiresAt: invite.expiresAt } };
    }

    if (event.action === "invite.activate") {
      const code = normalizeInviteCode(event.payload?.code);
      if (!INVITE_CODE_PATTERN.test(code) || !hasWriteRequestId(event)) {
        return invalidRequest();
      }
      if (!canUseInvite(user)) {
        return forbidden();
      }
      if (isAdmin(user)) {
        return failure("CONFLICT", "Administrator access is already active.");
      }
      if (user.activationStatus === "active") {
        return { ok: true, data: { userId: user.userId, accessState: "active" } };
      }
      const lockedUntil = user.inviteAttemptState?.lockedUntil;
      if (lockedUntil && new Date(lockedUntil).getTime() > now().getTime()) {
        return genericInviteFailure();
      }
      const codeHash = hashInviteCode(code);
      let invite = await findOne(invites, { recordType: INVITE_RECORD_TYPE, codeHash });
      const isOwnedReservation = (candidate) =>
        (candidate.status === "claimed" || candidate.status === "consumed") &&
        candidate.claimedByUserId === user.userId;
      const unavailable = () =>
        invite === null ||
        (!isOwnedReservation(invite) &&
          (invite.status !== "active" || new Date(invite.expiresAt).getTime() <= now().getTime()));
      if (unavailable()) {
        await recordInviteFailure(users, user, now());
        return genericInviteFailure();
      }
      if (invite.status === "active") {
        const claimed = await updateDocument(
          invites.where({ recordType: INVITE_RECORD_TYPE, inviteId: invite.inviteId, status: "active" }),
          {
            status: "claimed",
            claimedByUserId: user.userId,
            claimedAt: timestamp,
          },
        );
        if (claimed.updated !== 1) {
          invite = await findOne(invites, { recordType: INVITE_RECORD_TYPE, codeHash });
        } else {
          invite = { ...invite, status: "claimed", claimedByUserId: user.userId, claimedAt: timestamp };
        }
      }
      if (invite === null || !isOwnedReservation(invite)) {
        await recordInviteFailure(users, user, now());
        return genericInviteFailure();
      }
      if (invite.status === "claimed") {
        await updateDocument(
          invites.where({
            recordType: INVITE_RECORD_TYPE,
            inviteId: invite.inviteId,
            status: "claimed",
            claimedByUserId: user.userId,
          }),
          {
            status: "consumed",
            consumedByUserId: user.userId,
            consumedAt: timestamp,
          },
        );
      }
      user = {
        ...user,
        activationStatus: "active",
        activatedAt: timestamp,
        inviteAttemptState: null,
        updatedAt: timestamp,
      };
      await updateDocument(users.doc(user._id), {
        activationStatus: user.activationStatus,
        activatedAt: user.activatedAt,
        inviteAttemptState: null,
        updatedAt: timestamp,
      });
      return { ok: true, data: { userId: user.userId, accessState: "active" } };
    }

    if (event.action === "admin.inviteRevoke") {
      const inviteId = event.payload?.inviteId;
      if (typeof inviteId !== "string" || inviteId.length === 0 || inviteId.length > 100 || !hasWriteRequestId(event)) {
        return invalidRequest();
      }
      if (user.accountStatus !== "enabled" || accessState(user) !== "active" || !isAdmin(user)) {
        return forbidden();
      }
      const result = await updateDocument(
        invites.where({ recordType: INVITE_RECORD_TYPE, inviteId, status: "active" }),
        { status: "revoked", revokedAt: timestamp },
      );
      if (result.updated !== 1) {
        return failure("NOT_FOUND", "Invitation was not found.");
      }
      await addIfAbsent(auditLogs, {
        _id: `audit_${hashValue("applymate-invite-revoke-audit-v1", `${user.userId}:${event.requestId}`).slice(0, 24)}`,
        recordType: INVITE_AUDIT_RECORD_TYPE,
        action: "admin.inviteRevoke",
        actorUserId: user.userId,
        targetInviteId: inviteId,
        createdAt: timestamp,
      });
      return { ok: true, data: { inviteId, status: "revoked" } };
    }

    if (event.action === "admin.userSetEnabled") {
      const targetUserId = event.payload?.targetUserId;
      const enabled = event.payload?.enabled;
      const reason = event.payload?.reason;
      if (
        typeof targetUserId !== "string" ||
        typeof enabled !== "boolean" ||
        typeof reason !== "string" ||
        reason.trim() === "" ||
        reason.length > 500 ||
        !hasWriteRequestId(event)
      ) {
        return invalidRequest();
      }
      if (user.accountStatus !== "enabled" || accessState(user) !== "active" || !isAdmin(user)) {
        return forbidden();
      }
      const target = await findOne(users, { recordType: "user", userId: targetUserId });
      if (target === null || isAdmin(target)) return failure("NOT_FOUND", "User was not found.");
      await updateDocument(users.doc(target._id), {
        accountStatus: enabled ? "enabled" : "disabled",
        updatedAt: timestamp,
      });
      await addIfAbsent(auditLogs, {
        _id: `audit_${hashValue("applymate-user-status-audit-v1", `${user.userId}:${event.requestId}`).slice(0, 24)}`,
        recordType: "audit_log",
        action: "admin.userSetEnabled",
        actorUserId: user.userId,
        targetUserId,
        enabled,
        reason: reason.trim(),
        createdAt: timestamp,
      });
      return { ok: true, data: { userId: targetUserId, accountStatus: enabled ? "enabled" : "disabled" } };
    }

    if (event.action === "admin.quotaAdjust") {
      const targetUserId = event.payload?.targetUserId;
      const increase = event.payload?.increase;
      const reason = event.payload?.reason;
      if (
        typeof targetUserId !== "string" ||
        !Number.isInteger(increase) ||
        increase < 1 ||
        increase > 20 ||
        typeof reason !== "string" ||
        reason.trim() === "" ||
        reason.length > 500 ||
        !hasWriteRequestId(event)
      ) {
        return invalidRequest();
      }
      if (user.accountStatus !== "enabled" || accessState(user) !== "active" || !isAdmin(user)) {
        return forbidden();
      }
      const target = await findOne(users, { recordType: "user", userId: targetUserId });
      if (target === null || isAdmin(target)) return failure("NOT_FOUND", "User was not found.");
      const dateKey = beijingDateKey(now());
      const adjustedTotal = Math.min(20, Math.max(0, Number(target.dailyQuotaAdjustments?.[dateKey] || 0)) + increase);
      const dailyQuotaAdjustments = { ...(target.dailyQuotaAdjustments || {}), [dateKey]: adjustedTotal };
      await updateDocument(users.doc(target._id), { dailyQuotaAdjustments, updatedAt: timestamp });
      await addIfAbsent(auditLogs, {
        _id: `audit_${hashValue("applymate-quota-adjust-audit-v1", `${user.userId}:${event.requestId}`).slice(0, 24)}`,
        recordType: "audit_log",
        action: "admin.quotaAdjust",
        actorUserId: user.userId,
        targetUserId,
        dateKey,
        increase,
        temporaryIncrease: adjustedTotal,
        reason: reason.trim(),
        createdAt: timestamp,
      });
      return {
        ok: true,
        data: {
          targetUserId,
          dateKey,
          temporaryIncrease: adjustedTotal,
          limit: 20 + adjustedTotal,
        },
      };
    }

    if (event.action === "admin.stats") {
      if (!isEmptyPayload(event.payload)) return invalidRequest();
      if (user.accountStatus !== "enabled" || accessState(user) !== "active" || !isAdmin(user)) {
        return forbidden();
      }
      const [allUsers, allJobs, allApplications] = await Promise.all([
        findMany(users, { recordType: "user" }, 1000),
        findMany(database.collection("ai_jobs"), { recordType: "ai_job" }, 1000),
        findMany(applications, { recordType: "application" }, 1000),
      ]);
      const ordinaryUsers = allUsers.filter((item) => !isAdmin(item) && item.syntheticTest !== true);
      const ordinaryUserIds = new Set(ordinaryUsers.map((item) => item.userId));
      const generationJobs = allJobs.filter((item) =>
        ordinaryUserIds.has(item.userId) && item.syntheticTest !== true && item.kind === "greeting_generate"
      );
      const succeededUsers = new Set(
        generationJobs.filter((item) => item.status === "succeeded").map((item) => item.userId),
      );
      const copiedUsers = new Set(
        ordinaryUsers.filter((item) => item.analytics?.firstGreetingCopiedAt).map((item) => item.userId),
      );
      const ratedApplications = allApplications.filter((item) =>
        ordinaryUserIds.has(item.userId) && item.feedback?.rating
      );
      const satisfiedApplications = ratedApplications.filter((item) => item.feedback.rating === "satisfied");
      const activatedUsers = ordinaryUsers.filter((item) => item.activatedAt);
      const firstResumeConfirmedUsers = activatedUsers.filter((item) => {
        const activatedAt = new Date(item.activatedAt).getTime();
        const confirmedAt = new Date(item.firstResumeConfirmedAt).getTime();
        const elapsed = confirmedAt - activatedAt;
        return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 168 * 60 * 60 * 1000;
      });
      const rate = (numerator, denominator) => denominator === 0 ? null : numerator / denominator;
      return {
        ok: true,
        data: {
          users: ordinaryUsers.length,
          generationJobs: generationJobs.length,
          metrics: {
            firstResumeConfirmation: { numerator: firstResumeConfirmedUsers.length, denominator: activatedUsers.length },
            generationSuccess: { numerator: generationJobs.filter((item) => item.status === "succeeded").length, denominator: generationJobs.length },
            copy: { numerator: copiedUsers.size, denominator: succeededUsers.size },
            satisfaction: { numerator: satisfiedApplications.length, denominator: ratedApplications.length },
            sevenDayReturn: { numerator: ordinaryUsers.filter((item) => item.analytics?.returnedDay2To7At).length, denominator: ordinaryUsers.filter((item) => item.analytics?.firstGenerationSucceededAt).length },
          },
          ratios: {
            firstResumeConfirmation: rate(firstResumeConfirmedUsers.length, activatedUsers.length),
            generationSuccess: rate(generationJobs.filter((item) => item.status === "succeeded").length, generationJobs.length),
            copy: rate(copiedUsers.size, succeededUsers.size),
            satisfaction: rate(satisfiedApplications.length, ratedApplications.length),
            sevenDayReturn: rate(ordinaryUsers.filter((item) => item.analytics?.returnedDay2To7At).length, ordinaryUsers.filter((item) => item.analytics?.firstGenerationSucceededAt).length),
          },
        },
      };
    }

    return paused();
  };
}

async function recordInviteFailure(users, user, now) {
  const timestamps = (user.inviteAttemptState?.failureTimestamps || [])
    .filter((value) => new Date(value).getTime() > now.getTime() - INVITE_FAILURE_WINDOW_MILLISECONDS)
    .concat(now.toISOString());
  const state = {
    failureTimestamps: timestamps,
    ...(timestamps.length >= MAXIMUM_INVITE_FAILURES
      ? { lockedUntil: timestampAfter(now, INVITE_LOCK_MILLISECONDS) }
      : {}),
  };
  await updateDocument(users.doc(user._id), { inviteAttemptState: state, updatedAt: now.toISOString() });
}

module.exports = {
  CURRENT_VERSIONS,
  RELIABILITY_PROBE_KIND,
  SYNTHETIC_DELETION_COLLECTIONS,
  createLiveApiHandler,
  hashBootstrapToken,
  hashInviteCode,
  hashTrustedIdentity,
  hashTrustedOpenId,
  stripClientIdentity,
};

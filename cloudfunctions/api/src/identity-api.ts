import { randomBytes } from "node:crypto";

import { z } from "zod";

import {
  ApiResponseSchema,
  JOB_STATUS_LABELS,
  type ApiAction,
  type ApiResponse,
} from "../../../shared/src/index.js";

import { ActionRegistry, type ApiExecutionContext } from "./action-registry.js";
import { AccountDeletionService } from "./account-deletion-service.js";
import type { AdminStatsService } from "./admin-stats-service.js";
import {
  AgreementService,
  type AgreementVersions,
} from "./agreement-service.js";
import {
  createApiEntry,
  type ApiEntryDependencies,
} from "./api-entry.js";
import { DomainError } from "./domain-error.js";
import type { FeedbackService } from "./feedback-service.js";
import type { UserRecord } from "./identity-domain.js";
import type { IdentityRepository } from "./identity-repository.js";
import type { IdempotencyService } from "./idempotency-service.js";
import type { ApplicationService } from "./application-service.js";
import {
  GenerationConfirmJdPayloadSchema,
  GenerationCreatePayloadSchema,
} from "./generation-domain.js";
import type { GenerationConfirmationService } from "./generation-confirmation-service.js";
import { GenerationRewritePayloadSchema } from "./generation-rewrite-domain.js";
import type { GenerationRewriteWorkflowService } from "./generation-rewrite-workflow-service.js";
import type { GenerationWorkflowService } from "./generation-workflow-service.js";
import { InviteService } from "./invite-service.js";
import type { JobService } from "./job-service.js";
import type { QuotaService } from "./quota-service.js";
import {
  ResumeConfirmPayloadSchema,
  ResumeIdPayloadSchema,
  ResumeParsePayloadSchema,
} from "./resume-domain.js";
import type { ResumeConfirmationService } from "./resume-confirmation-service.js";
import type { ResumeManagementService } from "./resume-management-service.js";
import type { ResumeWorkflowService } from "./resume-workflow-service.js";
import { UserService, hashTrustedOpenId } from "./user-service.js";

const EmptyPayloadSchema = z.object({}).strict();
const AgreementPayloadSchema = z
  .object({
    userAgreementVersion: z.string().trim().min(1).max(100),
    privacyPolicyVersion: z.string().trim().min(1).max(100),
  })
  .strict();
const InviteActivationPayloadSchema = z
  .object({ code: z.string().trim().min(8).max(32) })
  .strict();
const InviteRevokePayloadSchema = z
  .object({ inviteId: z.string().trim().min(1).max(100) })
  .strict();
const PreferencePayloadSchema = z
  .object({ preferenceText: z.string() })
  .strict();
const UserSetEnabledPayloadSchema = z
  .object({
    targetUserId: z.string().trim().min(1).max(100),
    enabled: z.boolean(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
const JobGetPayloadSchema = z
  .object({ jobId: z.string().trim().min(1).max(100) })
  .strict();
const QuotaAdjustPayloadSchema = z
  .object({
    targetUserId: z.string().trim().min(1).max(100),
    increase: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
const ApplicationListPayloadSchema = z
  .object({
    status: z.enum(["not_applied", "applied"]).optional(),
  })
  .strict();
const ApplicationIdPayloadSchema = z
  .object({ applicationId: z.string().trim().min(1).max(100) })
  .strict();
const ApplicationUpdatePayloadSchema = z
  .object({
    applicationId: z.string().trim().min(1).max(100),
    greetingBody: z.string().optional(),
    status: z.enum(["not_applied", "applied"]).optional(),
    memo: z.string().optional(),
  })
  .strict()
  .refine(
    ({ greetingBody, status, memo }) =>
      greetingBody !== undefined || status !== undefined || memo !== undefined,
  );
const FeedbackSubmitPayloadSchema = z
  .object({
    applicationId: z.string().trim().min(1).max(100),
    rating: z.enum(["satisfied", "needs_improvement"]),
    note: z.string().optional(),
  })
  .strict();
const UserDeletePayloadSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("request") }).strict(),
  z
    .object({
      operation: z.literal("confirm"),
      confirmationToken: z.string().min(16).max(256),
    })
    .strict(),
]);

export interface IdentityAccessApiDependencies {
  repository: IdentityRepository;
  idempotency?: IdempotencyService;
  jobs?: JobService;
  quotas?: QuotaService;
  adminStats?: AdminStatsService;
  resumes?: ResumeWorkflowService;
  confirmations?: ResumeConfirmationService;
  management?: ResumeManagementService;
  generation?: GenerationWorkflowService;
  generationConfirmation?: GenerationConfirmationService;
  rewrite?: GenerationRewriteWorkflowService;
  applications?: ApplicationService;
  feedback?: FeedbackService;
  resourceGate?: ApiEntryDependencies["resourceGate"];
  currentVersions: AgreementVersions;
  adminOpenIds: readonly string[];
  now: () => Date;
  generateInviteCode?: () => string;
  generateDeletionToken?: () => string;
  readCloudBaseContext: ApiEntryDependencies["readCloudBaseContext"];
}

type AccessState =
  | "agreement_required"
  | "invite_required"
  | "active"
  | "disabled";

function invalidRequest(): ApiResponse {
  return {
    ok: false,
    error: {
      code: "INVALID_REQUEST",
      message: "Invalid request.",
      retryable: false,
    },
  };
}

function forbidden(): ApiResponse {
  return {
    ok: false,
    error: {
      code: "FORBIDDEN",
      message: "Access denied.",
      retryable: false,
    },
  };
}

function success(data: unknown): ApiResponse {
  return ApiResponseSchema.parse({ ok: true, data });
}

function accessState(
  user: UserRecord,
  agreements: AgreementService,
  isAdmin: boolean,
): AccessState {
  if (user.accountStatus === "disabled") {
    return "disabled";
  }
  if (!agreements.hasCurrentAgreements(user)) {
    return "agreement_required";
  }
  if (isAdmin || user.activationStatus === "active") {
    return "active";
  }
  return "invite_required";
}

export function createIdentityAccessApi(
  dependencies: IdentityAccessApiDependencies,
): (event: unknown) => Promise<ApiResponse> {
  const registry = new ActionRegistry();
  const users = new UserService(dependencies.repository);
  const agreements = new AgreementService(
    dependencies.repository,
    dependencies.currentVersions,
  );
  const invites = new InviteService(dependencies.repository);
  const accountDeletion = new AccountDeletionService(
    dependencies.repository,
    dependencies.generateDeletionToken,
  );
  const adminIdentityHashes = new Set(
    dependencies.adminOpenIds.map(hashTrustedOpenId),
  );

  async function currentUser(context: ApiExecutionContext): Promise<UserRecord> {
    return users.getOrCreateUser(context.trustedOpenId, dependencies.now());
  }

  function isAdmin(user: UserRecord): boolean {
    return adminIdentityHashes.has(user.identityHash);
  }

  function assertEnabled(
    user: UserRecord,
    action: ApiAction,
  ): void {
    if (!users.canAccessAction(user, action)) {
      throw new DomainError("FORBIDDEN", "Access denied.");
    }
  }

  function assertAdministrator(user: UserRecord): void {
    if (!isAdmin(user)) {
      throw new DomainError("FORBIDDEN", "Access denied.");
    }
  }

  function assertActivated(user: UserRecord): void {
    if (!isAdmin(user) && user.activationStatus !== "active") {
      throw new DomainError("INVITE_REQUIRED", "Invitation activation required.");
    }
  }

  registry.register("auth.status", async (payload, context) => {
    if (!EmptyPayloadSchema.safeParse(payload).success) {
      return invalidRequest();
    }
    const user = await currentUser(context);
    return success({
      userId: user.userId,
      accountStatus: user.accountStatus,
      accessState: accessState(user, agreements, isAdmin(user)),
      isAdmin: isAdmin(user),
      agreementRequired: !agreements.hasCurrentAgreements(user),
      inviteRequired:
        !isAdmin(user) && user.activationStatus === "pending_invite",
      currentVersions: agreements.currentVersions,
    });
  });

  registry.register("agreement.accept", async (payload, context) => {
    const parsed = AgreementPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return invalidRequest();
    }
    const user = await currentUser(context);
    if (!users.canAccessAction(user, "agreement.accept")) {
      return forbidden();
    }
    const updated = await agreements.acceptAgreements(
      user,
      parsed.data,
      dependencies.now(),
    );
    return success({
        accepted: true,
        accessState: accessState(updated, agreements, isAdmin(updated)),
    });
  });

  registry.register("user.get", async (payload, context) => {
    if (!EmptyPayloadSchema.safeParse(payload).success) {
      return invalidRequest();
    }
    const user = await currentUser(context);
    return success({
        accessState: accessState(user, agreements, isAdmin(user)),
        user: {
          userId: user.userId,
          accountStatus: user.accountStatus,
          activationStatus: user.activationStatus,
          agreements: user.agreements,
          preferenceText: user.preferenceText,
          preferenceFacts: user.preferenceFacts,
          isAdmin: isAdmin(user),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
    });
  });

  registry.register("admin.inviteCreate", async (payload, context) => {
    if (!EmptyPayloadSchema.safeParse(payload).success) {
      return invalidRequest();
    }
    const user = await currentUser(context);
    assertEnabled(user, "admin.inviteCreate");
    agreements.assertActionAgreement(user, "admin.inviteCreate");
    assertAdministrator(user);
    if (context.requestId === undefined) {
      throw new Error("Write request is missing an identifier.");
    }

    const code =
      dependencies.generateInviteCode?.() ??
      `AM-${randomBytes(8).toString("hex").toUpperCase()}`;
    const invite = await invites.createInvite(
      user.userId,
      code,
      dependencies.now(),
      `audit_${context.requestId}`,
    );
    return success({
      inviteId: invite.inviteId,
      code,
      expiresAt: invite.expiresAt,
    });
  });

  registry.register("admin.inviteRevoke", async (payload, context) => {
    const parsed = InviteRevokePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return invalidRequest();
    }
    const user = await currentUser(context);
    assertEnabled(user, "admin.inviteRevoke");
    agreements.assertActionAgreement(user, "admin.inviteRevoke");
    assertAdministrator(user);
    if (context.requestId === undefined) {
      throw new Error("Write request is missing an identifier.");
    }

    const revoked = await invites.revokeInvite(
      user.userId,
      parsed.data.inviteId,
      dependencies.now(),
      `audit_${context.requestId}`,
    );
    return success({ inviteId: revoked.inviteId, status: revoked.status });
  });

  registry.register("invite.activate", async (payload, context) => {
    const parsed = InviteActivationPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return invalidRequest();
    }
    const user = await currentUser(context);
    assertEnabled(user, "invite.activate");
    agreements.assertActionAgreement(user, "invite.activate");
    if (isAdmin(user)) {
      throw new DomainError(
        "CONFLICT",
        "Administrator access is already active.",
      );
    }

    const activated = await invites.activateInvite(
      user,
      parsed.data.code,
      dependencies.now(),
    );
    return success({
      userId: activated.userId,
      accessState: "active",
    });
  });

  registry.register("user.updatePreferences", async (payload, context) => {
    const parsed = PreferencePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return invalidRequest();
    }
    const user = await currentUser(context);
    assertEnabled(user, "user.updatePreferences");
    agreements.assertActionAgreement(user, "user.updatePreferences");
    assertActivated(user);

    const updated = await users.updatePreferences(
      user,
      parsed.data.preferenceText,
      dependencies.now(),
    );
    return success({
      preferenceText: updated.preferenceText,
      preferenceFacts: updated.preferenceFacts,
    });
  });

  registry.register("user.delete", async (payload, context) => {
    const parsed = UserDeletePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return invalidRequest();
    }
    const user = await currentUser(context);
    if (parsed.data.operation === "request") {
      return success(
        await accountDeletion.requestConfirmation(user, dependencies.now()),
      );
    }
    const deleted = await accountDeletion.confirm(
      user,
      parsed.data.confirmationToken,
      dependencies.now(),
    );
    return success({
      deletionStatus: deleted.deletionStatus,
      accountStatus: deleted.accountStatus,
      deletionRequestedAt: deleted.deletionRequestedAt,
      deletionDeadlineAt: deleted.deletionDeadlineAt,
    });
  });

  registry.register("admin.userSetEnabled", async (payload, context) => {
    const parsed = UserSetEnabledPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return invalidRequest();
    }
    const user = await currentUser(context);
    assertEnabled(user, "admin.userSetEnabled");
    agreements.assertActionAgreement(user, "admin.userSetEnabled");
    assertAdministrator(user);
    if (context.requestId === undefined) {
      throw new Error("Write request is missing an identifier.");
    }

    const target = await dependencies.repository.getUserById(
      parsed.data.targetUserId,
    );
    if (target === null) {
      throw new DomainError("NOT_FOUND", "User was not found.");
    }
    if (parsed.data.enabled && target.deletionStatus === "pending") {
      throw new DomainError(
        "CONFLICT",
        "Account deletion cannot be reversed.",
      );
    }
    const now = dependencies.now();
    const updated = await dependencies.repository.setUserEnabledWithAudit(
      parsed.data.targetUserId,
      parsed.data.enabled,
      {
        auditId: `audit_${context.requestId}`,
        action: "admin.userSetEnabled",
        actorUserId: user.userId,
        targetUserId: parsed.data.targetUserId,
        enabled: parsed.data.enabled,
        reason: parsed.data.reason,
        createdAt: now.toISOString(),
      },
    );
    if (updated === null) {
      throw new DomainError("NOT_FOUND", "User was not found.");
    }
    return success({
      userId: updated.userId,
      accountStatus: updated.accountStatus,
    });
  });

  const jobs = dependencies.jobs;
  if (jobs !== undefined) {
    registry.register("job.get", async (payload, context) => {
      const parsed = JobGetPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "job.get");
      agreements.assertActionAgreement(user, "job.get");
      assertActivated(user);
      const job = await jobs.getJobForUser(
        user.userId,
        parsed.data.jobId,
      );
      return success({
        jobId: job.jobId,
        kind: job.kind,
        status: job.status,
        statusLabel: JOB_STATUS_LABELS[job.status],
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        ...(job.result === undefined ? {} : { result: job.result }),
        ...(job.error === undefined ? {} : { error: job.error }),
      });
    });
  }

  const quotas = dependencies.quotas;
  if (quotas !== undefined) {
    registry.register("admin.quotaAdjust", async (payload, context) => {
      const parsed = QuotaAdjustPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "admin.quotaAdjust");
      agreements.assertActionAgreement(user, "admin.quotaAdjust");
      assertAdministrator(user);
      if (context.requestId === undefined) {
        throw new Error("Write request is missing an identifier.");
      }
      const target = await dependencies.repository.getUserById(
        parsed.data.targetUserId,
      );
      if (target === null) {
        throw new DomainError("NOT_FOUND", "User was not found.");
      }

      const usage = await quotas.increaseTemporaryQuota(
        user.userId,
        target.userId,
        parsed.data.increase,
        parsed.data.reason,
        context.requestId,
        dependencies.now(),
      );
      return success({
        targetUserId: target.userId,
        dateKey: usage.dateKey,
        temporaryIncrease: usage.temporaryIncrease,
        limit: usage.limit,
        remaining: usage.remaining,
      });
    });
  }

  const adminStats = dependencies.adminStats;
  if (adminStats !== undefined) {
    registry.register("admin.stats", async (payload, context) => {
      if (!EmptyPayloadSchema.safeParse(payload).success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "admin.stats");
      agreements.assertActionAgreement(user, "admin.stats");
      assertAdministrator(user);
      return success(await adminStats.get(dependencies.now()));
    });
  }

  const resumes = dependencies.resumes;
  if (resumes !== undefined) {
    registry.register("resume.parse", async (payload, context) => {
      const parsed = ResumeParsePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "resume.parse");
      agreements.assertActionAgreement(user, "resume.parse");
      assertActivated(user);
      const created = await resumes.createParseJob(
        user.userId,
        parsed.data,
        dependencies.now(),
      );
      return success(created);
    });
  }

  const confirmations = dependencies.confirmations;
  if (confirmations !== undefined) {
    registry.register("resume.confirm", async (payload, context) => {
      const parsed = ResumeConfirmPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "resume.confirm");
      agreements.assertActionAgreement(user, "resume.confirm");
      assertActivated(user);
      return success(
        await confirmations.confirm(
          user.userId,
          parsed.data.resumeId,
          parsed.data.profile,
          dependencies.now(),
        ),
      );
    });
  }

  const management = dependencies.management;
  if (management !== undefined) {
    registry.register("resume.list", async (payload, context) => {
      if (!EmptyPayloadSchema.safeParse(payload).success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "resume.list");
      agreements.assertActionAgreement(user, "resume.list");
      assertActivated(user);
      return success({ resumes: await management.list(user.userId) });
    });
    registry.register("resume.setDefault", async (payload, context) => {
      const parsed = ResumeIdPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "resume.setDefault");
      agreements.assertActionAgreement(user, "resume.setDefault");
      assertActivated(user);
      return success(
        await management.setDefault(
          user.userId,
          parsed.data.resumeId,
          dependencies.now(),
        ),
      );
    });
    registry.register("resume.delete", async (payload, context) => {
      const parsed = ResumeIdPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "resume.delete");
      agreements.assertActionAgreement(user, "resume.delete");
      assertActivated(user);
      return success(
        await management.delete(
          user.userId,
          parsed.data.resumeId,
          dependencies.now(),
        ),
      );
    });
  }

  const generation = dependencies.generation;
  if (generation !== undefined) {
    registry.register("generation.create", async (payload, context) => {
      const parsed = GenerationCreatePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "generation.create");
      agreements.assertActionAgreement(user, "generation.create");
      assertActivated(user);
      return success(
        await generation.createJob(
          user.userId,
          user.preferenceFacts,
          parsed.data,
          dependencies.now(),
        ),
      );
    });
  }

  const generationConfirmation = dependencies.generationConfirmation;
  if (generationConfirmation !== undefined) {
    registry.register("generation.confirmJd", async (payload, context) => {
      const parsed = GenerationConfirmJdPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "generation.confirmJd");
      agreements.assertActionAgreement(user, "generation.confirmJd");
      assertActivated(user);
      return success(
        await generationConfirmation.confirm(
          user.userId,
          parsed.data.jobId,
          parsed.data.jobDescription,
          dependencies.now(),
        ),
      );
    });
  }

  const rewrite = dependencies.rewrite;
  if (rewrite !== undefined) {
    registry.register("generation.rewrite", async (payload, context) => {
      const parsed = GenerationRewritePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "generation.rewrite");
      agreements.assertActionAgreement(user, "generation.rewrite");
      assertActivated(user);
      return success(
        await rewrite.createJob(user.userId, parsed.data, dependencies.now()),
      );
    });
  }

  const feedback = dependencies.feedback;
  const applications = dependencies.applications;
  if (applications !== undefined) {
    registry.register("application.list", async (payload, context) => {
      const parsed = ApplicationListPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "application.list");
      agreements.assertActionAgreement(user, "application.list");
      assertActivated(user);
      return success({
        applications: await applications.list(user.userId, parsed.data),
      });
    });
    registry.register("application.get", async (payload, context) => {
      const parsed = ApplicationIdPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "application.get");
      agreements.assertActionAgreement(user, "application.get");
      assertActivated(user);
      const detail = await applications.get(
        user.userId,
        parsed.data.applicationId,
      );
      const applicationFeedback =
        feedback === undefined
          ? null
          : await feedback.getForApplication(
              user.userId,
              parsed.data.applicationId,
            );
      return success({
        ...detail,
        ...(applicationFeedback === null
          ? {}
          : { feedback: applicationFeedback }),
      });
    });
    registry.register("application.update", async (payload, context) => {
      const parsed = ApplicationUpdatePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "application.update");
      agreements.assertActionAgreement(user, "application.update");
      assertActivated(user);
      const { applicationId, ...update } = parsed.data;
      return success(
        await applications.update(
          user.userId,
          applicationId,
          update,
          dependencies.now(),
        ),
      );
    });
    registry.register("application.delete", async (payload, context) => {
      const parsed = ApplicationIdPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "application.delete");
      agreements.assertActionAgreement(user, "application.delete");
      assertActivated(user);
      await applications.delete(user.userId, parsed.data.applicationId);
      return success({ deletedApplicationId: parsed.data.applicationId });
    });
  }

  if (feedback !== undefined) {
    registry.register("feedback.submit", async (payload, context) => {
      const parsed = FeedbackSubmitPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return invalidRequest();
      }
      const user = await currentUser(context);
      assertEnabled(user, "feedback.submit");
      agreements.assertActionAgreement(user, "feedback.submit");
      assertActivated(user);
      return success({
        feedback: await feedback.submit(
          user.userId,
          parsed.data,
          dependencies.now(),
        ),
      });
    });
  }

  return createApiEntry({
    registry,
    readCloudBaseContext: dependencies.readCloudBaseContext,
    ...(dependencies.idempotency === undefined
      ? {}
      : {
          idempotency: {
            service: dependencies.idempotency,
            createCallerKey: hashTrustedOpenId,
            now: dependencies.now,
          },
        }),
    ...(dependencies.resourceGate === undefined
      ? {}
      : { resourceGate: dependencies.resourceGate }),
  });
}

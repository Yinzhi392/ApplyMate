import { z } from "zod";

export const RESOURCE_KINDS = [
  "ocr",
  "model",
  "cloud_function",
  "storage",
  "traffic",
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const ResourceUsageLogSchema = z
  .object({
    logId: z.string().trim().min(1).max(100),
    userId: z.string().trim().min(1).max(100),
    resource: z.enum(RESOURCE_KINDS),
    operation: z.string().trim().min(1).max(100),
    units: z.number().nonnegative().finite(),
    unitName: z.string().trim().min(1).max(50),
    estimatedCostYuan: z.number().nonnegative().finite(),
    actualCostYuan: z.number().nonnegative().finite(),
    durationMs: z.number().int().nonnegative(),
    status: z.enum(["succeeded", "failed"]),
    modelId: z.string().trim().min(1).max(100).optional(),
    promptVersion: z.string().trim().min(1).max(100).optional(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type ResourceUsageLog = z.infer<typeof ResourceUsageLogSchema>;

export interface ResourceUsageStats {
  resource: ResourceKind;
  calls: number;
  units: number;
  estimatedCostYuan: number;
  actualCostYuan: number;
  failures: number;
}

export interface ResourceCostSummary {
  resources: Array<{
    resource: ResourceKind;
    calls: number;
    estimatedCostYuan: number;
    actualCostYuan: number;
  }>;
  estimatedCostYuan: number;
  actualCostYuan: number;
  actualCostIsZero: boolean;
}

export function calculateResourceCostSummary(
  input: readonly ResourceUsageLog[],
): ResourceCostSummary {
  const logs = input.map((log) => ResourceUsageLogSchema.parse(log));
  const resources = RESOURCE_KINDS.map((resource) => {
    const matching = logs.filter((log) => log.resource === resource);
    return {
      resource,
      calls: matching.length,
      estimatedCostYuan: matching.reduce(
        (total, log) => total + log.estimatedCostYuan,
        0,
      ),
      actualCostYuan: matching.reduce(
        (total, log) => total + log.actualCostYuan,
        0,
      ),
    };
  });
  const estimatedCostYuan = resources.reduce(
    (total, resource) => total + resource.estimatedCostYuan,
    0,
  );
  const actualCostYuan = resources.reduce(
    (total, resource) => total + resource.actualCostYuan,
    0,
  );
  return {
    resources,
    estimatedCostYuan,
    actualCostYuan,
    actualCostIsZero: actualCostYuan === 0,
  };
}

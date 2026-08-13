import { z } from "zod";

export const ModelRuntimeDisclosureSchema = z.object({
  mode: z.enum(["demo", "real"]),
  providerName: z.string().trim().min(1).max(120),
  modelName: z.string().trim().min(1).max(120),
  modelId: z.string().trim().min(1).max(160),
  filingReference: z.string().trim().min(1).max(300),
}).strict();

export const GenerationDisclosureSnapshotSchema = ModelRuntimeDisclosureSchema.extend({
  promptVersion: z.string().trim().min(1).max(120),
}).strict();

export type ModelRuntimeDisclosure = z.infer<typeof ModelRuntimeDisclosureSchema>;
export type GenerationDisclosureSnapshot = z.infer<
  typeof GenerationDisclosureSnapshotSchema
>;

export interface AvailableGenerationDisclosure extends GenerationDisclosureSnapshot {
  availability: "available";
  message: string;
}

export interface UnavailableGenerationDisclosure {
  availability: "unavailable";
  message: "生成信息不可用";
}

export type GenerationDisclosureView =
  | AvailableGenerationDisclosure
  | UnavailableGenerationDisclosure;

export function createDemoGenerationDisclosureSnapshot(
  modelId: string,
  promptVersion: string,
): GenerationDisclosureSnapshot {
  return GenerationDisclosureSnapshotSchema.parse({
    mode: "demo",
    providerName: "ApplyMate 本地演示适配器",
    modelName: "本地合成响应",
    modelId,
    promptVersion,
    filingReference: "本地演示不适用",
  });
}

export function createGenerationDisclosureView(
  snapshot: GenerationDisclosureSnapshot | undefined,
): GenerationDisclosureView {
  if (snapshot === undefined) {
    return { availability: "unavailable", message: "生成信息不可用" };
  }
  const parsed = GenerationDisclosureSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    return { availability: "unavailable", message: "生成信息不可用" };
  }
  return {
    availability: "available",
    ...parsed.data,
    message: parsed.data.mode === "demo"
      ? "本地演示数据，未调用真实 OCR 或模型"
      : `由 ${parsed.data.providerName} 的 ${parsed.data.modelName} 生成`,
  };
}

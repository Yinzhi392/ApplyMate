import { createHash } from "node:crypto";

import {
  GreetingDraftSchema,
  ModelRuntimeDisclosureSchema,
  type GreetingDraft,
  type ModelRuntimeDisclosure,
} from "../../../shared/src/index.js";

import { GenerationProcessingError } from "./generation-processing-error.js";

export type TextModelProviderFailure =
  | "timeout"
  | "rate_limited"
  | "failed";

export class TextModelProviderError extends Error {
  constructor(readonly kind: TextModelProviderFailure) {
    super("Text model provider request failed.");
    this.name = "TextModelProviderError";
  }
}

export interface GreetingTextModelProvider {
  modelId: string;
  disclosure?: Omit<ModelRuntimeDisclosure, "modelId">;
  generate(maskedInput: string, signal?: AbortSignal): Promise<unknown>;
}

export interface GreetingModelResult {
  draft: GreetingDraft;
  model: ModelRuntimeDisclosure;
}

export interface ModelCallLog {
  modelId: string;
  status: "succeeded" | "invalid_output" | "timeout" | "rate_limited" | "failed";
  durationMs: number;
  inputHash: string;
  outputHash?: string;
}

export interface ModelCallLogger {
  record(entry: ModelCallLog): void | Promise<void>;
}

class ProviderDeadlineError extends Error {
  constructor() {
    super("Provider deadline reached.");
    this.name = "ProviderDeadlineError";
  }
}

function hashContent(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function decodeDraft(value: unknown): GreetingDraft | null {
  let decoded = value;
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return null;
    }
  }
  const parsed = GreetingDraftSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

export class GreetingModelGateway {
  constructor(
    private readonly primary: GreetingTextModelProvider,
    private readonly fallback?: GreetingTextModelProvider,
    private readonly logger?: ModelCallLogger,
    private readonly attemptTimeoutMs = 20_000,
  ) {
    const providerCount = fallback === undefined ? 1 : 2;
    if (
      !Number.isSafeInteger(attemptTimeoutMs) ||
      attemptTimeoutMs <= 0 ||
      attemptTimeoutMs * providerCount >= 45_000
    ) {
      throw new RangeError("Total model timeout must remain below 45 seconds.");
    }
  }

  async generate(maskedInput: string, signal?: AbortSignal): Promise<GreetingDraft> {
    return (await this.generateWithMetadata(maskedInput, signal)).draft;
  }

  async generateWithMetadata(
    maskedInput: string,
    signal?: AbortSignal,
  ): Promise<GreetingModelResult> {
    const providers = [
      this.primary,
      ...(this.fallback === undefined ? [] : [this.fallback]),
    ];
    let sawInvalidOutput = false;
    for (const provider of providers) {
      const started = Date.now();
      const controller = new AbortController();
      let rejectParentDeadline: ((error: ProviderDeadlineError) => void) | undefined;
      const abortFromParent = () => {
        controller.abort();
        rejectParentDeadline?.(new ProviderDeadlineError());
      };
      const parentDeadline = new Promise<never>((_resolve, reject) => {
        rejectParentDeadline = reject;
        if (signal?.aborted === true) {
          abortFromParent();
          return;
        }
        signal?.addEventListener("abort", abortFromParent, { once: true });
      });
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          controller.abort();
          reject(new ProviderDeadlineError());
        }, this.attemptTimeoutMs);
      });
      try {
        const output = await Promise.race([
          provider.generate(maskedInput, controller.signal),
          deadline,
          parentDeadline,
        ]);
        const parsed = decodeDraft(output);
        if (parsed === null) {
          sawInvalidOutput = true;
          await this.writeLog(provider.modelId, "invalid_output", started, maskedInput, output);
          continue;
        }
        await this.writeLog(provider.modelId, "succeeded", started, maskedInput, output);
        return {
          draft: parsed,
          model: ModelRuntimeDisclosureSchema.parse({
            mode: provider.disclosure?.mode ?? "demo",
            providerName: provider.disclosure?.providerName ?? "本地测试适配器",
            modelName: provider.disclosure?.modelName ?? "合成模型响应",
            modelId: provider.modelId,
            filingReference: provider.disclosure?.filingReference ?? "本地演示不适用",
          }),
        };
      } catch (error) {
        const status =
          error instanceof ProviderDeadlineError ||
          (error instanceof TextModelProviderError && error.kind === "timeout")
            ? "timeout"
            : error instanceof TextModelProviderError && error.kind === "rate_limited"
              ? "rate_limited"
              : "failed";
        await this.writeLog(provider.modelId, status, started, maskedInput);
        if (signal?.aborted === true) {
          throw new GenerationProcessingError(
            "MODEL_FAILED",
            "Greeting generation was cancelled.",
            true,
          );
        }
      } finally {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }
        signal?.removeEventListener("abort", abortFromParent);
      }
    }
    if (sawInvalidOutput) {
      throw new GenerationProcessingError(
        "MODEL_INVALID_OUTPUT",
        "Greeting generation returned an invalid result.",
      );
    }
    throw new GenerationProcessingError(
      "MODEL_FAILED",
      "Greeting generation is temporarily unavailable.",
      true,
    );
  }

  private async writeLog(
    modelId: string,
    status: ModelCallLog["status"],
    started: number,
    input: string,
    output?: unknown,
  ): Promise<void> {
    if (this.logger === undefined) {
      return;
    }
    const serializedOutput =
      output === undefined
        ? undefined
        : typeof output === "string"
          ? output
          : JSON.stringify(output);
    await this.logger.record({
      modelId,
      status,
      durationMs: Math.max(0, Date.now() - started),
      inputHash: hashContent(input),
      ...(serializedOutput === undefined
        ? {}
        : { outputHash: hashContent(serializedOutput) }),
    });
  }
}

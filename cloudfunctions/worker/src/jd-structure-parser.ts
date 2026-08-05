import {
  JobDescriptionSchema,
  type JobDescription,
} from "../../../shared/src/index.js";

import { GenerationProcessingError } from "./generation-processing-error.js";

export interface JdStructureModelPort {
  parseJobDescription(maskedText: string): Promise<unknown>;
}

function decodeJobDescription(value: unknown): JobDescription | null {
  let decoded = value;
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return null;
    }
  }
  const parsed = JobDescriptionSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

export class JdStructureParser {
  constructor(
    private readonly primary: JdStructureModelPort,
    private readonly fallback?: JdStructureModelPort,
  ) {}

  async parse(maskedText: string): Promise<JobDescription> {
    const providers = [
      this.primary,
      ...(this.fallback === undefined ? [] : [this.fallback]),
    ];
    let thrown = 0;
    for (const provider of providers) {
      let output: unknown;
      try {
        output = await provider.parseJobDescription(maskedText);
      } catch {
        thrown += 1;
        continue;
      }
      const parsed = decodeJobDescription(output);
      if (parsed !== null) {
        return parsed;
      }
    }
    if (thrown === providers.length) {
      throw new GenerationProcessingError(
        "MODEL_FAILED",
        "JD parsing is temporarily unavailable.",
        true,
      );
    }
    throw new GenerationProcessingError(
      "MODEL_INVALID_OUTPUT",
      "JD parsing returned an invalid result.",
    );
  }
}


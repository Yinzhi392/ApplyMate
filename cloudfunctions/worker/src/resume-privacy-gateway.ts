import {
  maskSensitiveText,
  type SensitiveDataType,
} from "../../../shared/src/index.js";

export interface ResumeTextModelPort<T> {
  parseResumeText(maskedText: string): Promise<T>;
}

export interface PrivacyProtectedModelResult<T> {
  value: T;
  maskedTypes: SensitiveDataType[];
  maskedCount: number;
}

export class ResumePrivacyGateway<T> {
  constructor(private readonly model: ResumeTextModelPort<T>) {}

  async parseResumeText(
    extractedText: string,
  ): Promise<PrivacyProtectedModelResult<T>> {
    const masked = maskSensitiveText(extractedText);
    const maskedTypes = Array.from(
      new Set(masked.matches.map((match) => match.type)),
    );
    const value = await this.model.parseResumeText(masked.text);

    return {
      value,
      maskedTypes,
      maskedCount: masked.matches.length,
    };
  }
}

import { z } from "zod";

export const EvaluationCaseVerdictSchema = z
  .object({
    caseId: z.string().regex(/^C\d{2}$/u),
    humanConfirmed: z.boolean(),
    fields: z
      .array(
        z
          .object({
            fieldId: z.string().trim().min(1).max(100),
            correct: z.boolean(),
          })
          .strict(),
      )
      .length(6),
  })
  .strict();

export type EvaluationCaseVerdict = z.infer<
  typeof EvaluationCaseVerdictSchema
>;

export interface FieldAccuracyResult {
  confirmedCases: number;
  correctFields: number;
  totalFields: number;
  accuracy: number;
  formal: true;
}

export function calculateFieldAccuracy(
  input: readonly EvaluationCaseVerdict[],
): FieldAccuracyResult {
  const cases = input.map((item) => EvaluationCaseVerdictSchema.parse(item));
  const uniqueCaseIds = new Set(cases.map(({ caseId }) => caseId));
  const expectedCaseIds = new Set(
    Array.from({ length: 30 }, (_, index) =>
      `C${String(index + 1).padStart(2, "0")}`,
    ),
  );
  if (
    cases.length !== 30 ||
    uniqueCaseIds.size !== 30 ||
    [...uniqueCaseIds].some((caseId) => !expectedCaseIds.has(caseId)) ||
    cases.some(
      ({ fields }) => new Set(fields.map(({ fieldId }) => fieldId)).size !== 6,
    ) ||
    cases.some(({ humanConfirmed }) => !humanConfirmed)
  ) {
    throw new Error(
      "Formal field-accuracy evaluation requires exactly 30 human-confirmed cases.",
    );
  }
  const fields = cases.flatMap(({ fields: caseFields }) => caseFields);
  const correctFields = fields.filter(({ correct }) => correct).length;
  return {
    confirmedCases: cases.length,
    correctFields,
    totalFields: fields.length,
    accuracy: correctFields / fields.length,
    formal: true,
  };
}

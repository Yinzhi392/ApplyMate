import { describe, expect, it } from "vitest";

import {
  GeneratedClaimSchema,
  validateClaimEvidence,
} from "../../shared/src/index.js";

const validFactId = "fact_1234567890abcdef12345678";
const validJdFieldId = "jd_hard_skill_1";

describe("per-claim evidence", () => {
  it("rejects a claim without a source", () => {
    expect(
      GeneratedClaimSchema.safeParse({
        claimId: "claim_1",
        text: "我掌握 SQL",
        sources: [],
      }).success,
    ).toBe(false);
  });

  it("rejects malformed and unknown source IDs", () => {
    expect(
      GeneratedClaimSchema.safeParse({
        claimId: "claim_1",
        text: "我掌握 SQL",
        sources: [{ type: "fact", factId: "fact_invalid" }],
      }).success,
    ).toBe(false);
    expect(
      GeneratedClaimSchema.safeParse({
        claimId: "claim_1",
        text: "岗位需要 SQL",
        sources: [{ type: "jd", fieldId: "invalid" }],
      }).success,
    ).toBe(false);

    const result = validateClaimEvidence(
      [
        {
          claimId: "claim_1",
          text: "我掌握 SQL",
          sources: [{ type: "fact", factId: validFactId }],
        },
      ],
      { factIds: new Set(), jdFieldIds: new Set() },
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`UNKNOWN_FACT_ID:${validFactId}`);
  });

  it("accepts one claim mapped to multiple current sources", () => {
    const result = validateClaimEvidence(
      [
        {
          claimId: "claim_match_1",
          text: "我的 SQL 项目与岗位要求匹配",
          sources: [
            { type: "fact", factId: validFactId },
            { type: "jd", fieldId: validJdFieldId },
          ],
        },
      ],
      {
        factIds: new Set([validFactId]),
        jdFieldIds: new Set([validJdFieldId]),
      },
    );

    expect(result).toEqual({ valid: true, claims: expect.any(Array), errors: [] });
  });
});

import { describe, expect, it } from "vitest";

import { resolveRecordDetailLoadState } from "../../web/src/features/records/record-detail-state";

describe("record detail loading state", () => {
  it("prioritizes a foreign-record error over the missing application skeleton", () => {
    expect(resolveRecordDetailLoadState({
      hasApplication: false,
      hasError: true,
      isLoading: false,
    })).toBe("error");
  });

  it("keeps genuine pending requests in the loading state", () => {
    expect(resolveRecordDetailLoadState({
      hasApplication: false,
      hasError: false,
      isLoading: true,
    })).toBe("loading");
  });

  it("renders a successfully loaded record", () => {
    expect(resolveRecordDetailLoadState({
      hasApplication: true,
      hasError: false,
      isLoading: false,
    })).toBe("ready");
  });
});

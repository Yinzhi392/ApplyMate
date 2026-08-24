export type RecordDetailLoadState = "error" | "loading" | "ready";

export function resolveRecordDetailLoadState(input: {
  hasApplication: boolean;
  hasError: boolean;
  isLoading: boolean;
}): RecordDetailLoadState {
  if (input.hasError) return "error";
  if (input.isLoading || !input.hasApplication) return "loading";
  return "ready";
}

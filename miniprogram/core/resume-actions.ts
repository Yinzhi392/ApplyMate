export type ResumeActionType = "continue_confirmation" | "set_default" | "delete";

export interface ResumeAction {
  label: string;
  type: ResumeActionType;
}

export function createResumeActions(input: {
  isDefault: boolean;
  status: "awaiting_confirmation" | "confirmed";
}): ResumeAction[] {
  if (input.status === "awaiting_confirmation") {
    return [
      { label: "继续核对", type: "continue_confirmation" },
      { label: "删除", type: "delete" },
    ];
  }

  if (!input.isDefault) {
    return [
      { label: "设为默认", type: "set_default" },
      { label: "删除", type: "delete" },
    ];
  }

  return [{ label: "删除", type: "delete" }];
}

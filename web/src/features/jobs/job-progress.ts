const GREETING_STAGES = ["读取岗位输入", "识别岗位职责与要求", "匹配简历事实并生成"];
const RESUME_STAGES = ["读取简历文件", "提取简历文字", "整理待核对事实"];

function stageIndex(status: string | undefined, resume: boolean): number {
  if (status === "queued") return 0;
  if (status === "ocr") return 1;
  if (status === "parsing") return resume ? 2 : 1;
  if (status === "awaiting_user_confirmation") return 2;
  return 2;
}

export function createJobProgressContent(
  kind: string | null | undefined,
  status: string | undefined,
  failureStage?: string,
): { activeIndex: number; stages: string[]; title: string } {
  const resume = kind === "resume" || kind === "resume_parse";
  const effectiveStatus = status === "failed" ? failureStage ?? "queued" : status;
  return {
    activeIndex: stageIndex(effectiveStatus, resume),
    stages: resume ? RESUME_STAGES : GREETING_STAGES,
    title: status === "failed"
      ? resume ? "简历解析未完成" : "开场白生成未完成"
      : resume ? "正在解析简历" : "正在生成开场白",
  };
}

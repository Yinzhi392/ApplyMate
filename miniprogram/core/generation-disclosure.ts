export interface ClientGenerationDisclosure {
  availability: "available" | "unavailable";
  message: string;
  mode?: "demo" | "real";
  providerName?: string;
  modelName?: string;
  modelId?: string;
  promptVersion?: string;
  filingReference?: string;
}

export function describeGenerationDisclosure(
  disclosure: ClientGenerationDisclosure | undefined,
): { message: string; details: string } {
  if (disclosure?.availability !== "available") {
    return { message: "生成信息不可用", details: "历史记录未保存模型快照" };
  }
  const details = [
    disclosure.providerName,
    disclosure.modelName,
    disclosure.modelId,
    disclosure.promptVersion,
    disclosure.filingReference,
  ].filter((value): value is string => typeof value === "string" && value !== "");
  return {
    message: disclosure.message,
    details: details.join(" · "),
  };
}

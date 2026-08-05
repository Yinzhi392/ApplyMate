export const AI_CONTENT_LABEL = "AI生成内容，请核对真实性";

export function composeGreetingCopy(body: string): string {
  return `${body.trimEnd()}\n${AI_CONTENT_LABEL}`;
}

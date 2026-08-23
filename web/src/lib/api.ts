import { ApiResponseSchema, type ApiAction } from "../../../shared/src/api-contract";

import { requireCloudbaseApp } from "./cloudbase-app";
import { requireAuthenticatedIdentity } from "./session";

export class WebApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WebApiError";
  }
}

export async function callApi<T>(
  action: ApiAction,
  payload: Record<string, unknown>,
  requestId?: string,
): Promise<T> {
  await requireAuthenticatedIdentity();
  const response = await (await requireCloudbaseApp()).callFunction({
    name: import.meta.env.VITE_API_FUNCTION_NAME?.trim() || "api",
    data: { action, payload, ...(requestId === undefined ? {} : { requestId }) },
  });
  const parsed = ApiResponseSchema.safeParse(response.result);
  if (!parsed.success) {
    throw new Error("服务返回格式异常，请稍后重试。");
  }
  if (!parsed.data.ok) {
    throw new WebApiError(
      parsed.data.error.code,
      parsed.data.error.message,
      parsed.data.error.retryable,
    );
  }
  return parsed.data.data as T;
}

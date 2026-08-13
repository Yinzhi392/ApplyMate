export type ClientApiAction =
  | "auth.status"
  | "agreement.accept"
  | "invite.activate"
  | "user.get"
  | "user.updatePreferences"
  | "user.delete"
  | "resume.parse"
  | "resume.confirm"
  | "resume.list"
  | "resume.setDefault"
  | "resume.delete"
  | "generation.create"
  | "generation.rewrite"
  | "job.get"
  | "application.list"
  | "application.get"
  | "application.update"
  | "application.delete"
  | "feedback.submit"
  | "analytics.track"
  | "admin.inviteCreate"
  | "admin.inviteRevoke"
  | "admin.userSetEnabled"
  | "admin.quotaAdjust"
  | "admin.stats";

export interface CloudFunctionRequest {
  name: string;
  data: {
    action: ClientApiAction;
    payload: Record<string, unknown>;
    requestId?: string;
  };
}

export type CloudFunctionCaller = (
  request: CloudFunctionRequest,
) => Promise<{ result?: unknown }>;

interface ApiSuccess {
  ok: true;
  data?: unknown;
}

interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

type ApiResult = ApiSuccess | ApiFailure;

function isApiResult(value: unknown): value is ApiResult {
  if (value === null || typeof value !== "object" || !("ok" in value)) {
    return false;
  }
  const candidate = value as { ok: unknown; error?: unknown };
  if (candidate.ok === true) {
    return true;
  }
  if (candidate.ok !== false || candidate.error === null || typeof candidate.error !== "object") {
    return false;
  }
  const error = candidate.error as Record<string, unknown>;
  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    typeof error.retryable === "boolean"
  );
}

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ApiClient {
  read<T>(action: ClientApiAction, payload: Record<string, unknown>): Promise<T>;
  write<T>(
    action: ClientApiAction,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<T>;
}

export function createRequestId(): string {
  const pattern = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return pattern.replace(/[xy]/gu, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createApiClient(
  callFunction: CloudFunctionCaller,
  requestIdFactory: () => string = createRequestId,
): ApiClient {
  async function call<T>(request: CloudFunctionRequest): Promise<T> {
    let response: { result?: unknown };
    try {
      response = await callFunction(request);
    } catch {
      throw new ApiClientError("NETWORK_ERROR", "网络连接失败，请稍后重试。", true);
    }
    if (!isApiResult(response.result)) {
      throw new ApiClientError("INVALID_RESPONSE", "服务返回异常，请稍后重试。", true);
    }
    if (!response.result.ok) {
      throw new ApiClientError(
        response.result.error.code,
        response.result.error.message,
        response.result.error.retryable,
      );
    }
    return response.result.data as T;
  }

  return {
    read<T>(action: ClientApiAction, payload: Record<string, unknown>): Promise<T> {
      return call<T>({ name: "api", data: { action, payload } });
    },
    write<T>(
      action: ClientApiAction,
      payload: Record<string, unknown>,
      requestId = requestIdFactory(),
    ): Promise<T> {
      return call<T>({ name: "api", data: { action, payload, requestId } });
    },
  };
}

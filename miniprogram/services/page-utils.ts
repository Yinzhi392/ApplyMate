import { ApiClientError } from "./api-client.js";

export function messageFrom(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "操作没有完成，请重新尝试。";
}

export function isWeakNetwork(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === "NETWORK_ERROR";
}

export function showSuccess(title: string): void {
  wx.showToast({ title, icon: "success" });
}

export function showError(error: unknown): void {
  wx.showToast({ title: messageFrom(error), icon: "none", duration: 2600 });
}

export function openPage(url: string): void {
  void wx.navigateTo({ url });
}

export function replaceWithLogin(): void {
  void wx.reLaunch({ url: "/pages/login/index" });
}

export function switchHome(): void {
  void wx.switchTab({ url: "/pages/home/index" });
}

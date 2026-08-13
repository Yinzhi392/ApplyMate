import type { ApiClient } from "../services/api-client.js";

export const ANALYTICS_STORAGE_KEY = "applymate:pending-analytics";
const MAX_PENDING_EVENTS = 20;

export type ClientAnalyticsEvent =
  | { event: "app_opened" }
  | { event: "greeting_copied"; applicationId: string };

export interface AnalyticsStorage {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

function pendingEvents(storage: AnalyticsStorage): ClientAnalyticsEvent[] {
  const value = storage.get(ANALYTICS_STORAGE_KEY);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is ClientAnalyticsEvent => {
    if (item === null || typeof item !== "object") {
      return false;
    }
    const record = item as Record<string, unknown>;
    return (
      record.event === "app_opened" ||
      (record.event === "greeting_copied" &&
        typeof record.applicationId === "string")
    );
  });
}

export function createAnalyticsTracker(
  api: Pick<ApiClient, "write">,
  storage: AnalyticsStorage,
  requestIdFactory: () => string,
): { track(event: ClientAnalyticsEvent): Promise<boolean> } {
  async function send(event: ClientAnalyticsEvent): Promise<void> {
    await api.write("analytics.track", event, requestIdFactory());
  }

  return {
    async track(event): Promise<boolean> {
      const queued = pendingEvents(storage);
      const remaining: ClientAnalyticsEvent[] = [];
      for (let index = 0; index < queued.length; index += 1) {
        try {
          await send(queued[index]!);
        } catch {
          remaining.push(...queued.slice(index));
          storage.set(
            ANALYTICS_STORAGE_KEY,
            [...remaining, event].slice(-MAX_PENDING_EVENTS),
          );
          return false;
        }
      }
      try {
        await send(event);
        storage.set(ANALYTICS_STORAGE_KEY, []);
        return true;
      } catch {
        storage.set(
          ANALYTICS_STORAGE_KEY,
          [...remaining, event].slice(-MAX_PENDING_EVENTS),
        );
        return false;
      }
    },
  };
}

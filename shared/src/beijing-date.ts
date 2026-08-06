const BEIJING_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1_000;

export function getBeijingDateKey(now: Date): string {
  return new Date(now.getTime() + BEIJING_OFFSET_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
}

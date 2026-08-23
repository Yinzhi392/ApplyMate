export const JD_IMAGE_PROFILES = [
  { id: "720-q80", maxEdge: 720, quality: 0.8 },
  { id: "1080-q78", maxEdge: 1080, quality: 0.78 },
  { id: "1440-q75", maxEdge: 1440, quality: 0.75 },
] as const;

export type JdImageProfile = (typeof JD_IMAGE_PROFILES)[number];

export interface JdImageEvaluationResult {
  bytes: number;
  criticalFieldRetention: number;
  hasCriticalFieldRegression: boolean;
  profileId: JdImageProfile["id"];
}

export function selectJdImageProfile(
  results: readonly JdImageEvaluationResult[],
): JdImageProfile {
  const passing = results
    .filter((result) => result.criticalFieldRetention >= 0.99 && !result.hasCriticalFieldRegression)
    .sort((left, right) => left.bytes - right.bytes || left.profileId.localeCompare(right.profileId));
  const selectedId = passing[0]?.profileId ?? "1440-q75";
  return JD_IMAGE_PROFILES.find(({ id }) => id === selectedId) ?? JD_IMAGE_PROFILES[2];
}

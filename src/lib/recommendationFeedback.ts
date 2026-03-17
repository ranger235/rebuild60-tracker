export type SessionOutcome = "as_prescribed" | "modified" | "partial" | "abandoned";

export type PrimaryOutcome = "progressed" | "matched" | "regressed" | "unknown";

export function classifySessionOutcome(params: {
  hasWork: boolean;
  adherenceScore: number;
  matchedCount: number;
  totalRecommended: number;
  substitutionCount: number;
  missedCount: number;
  volumeDelta: number | null;
}): SessionOutcome {
  const { hasWork, adherenceScore, matchedCount, totalRecommended, substitutionCount, missedCount, volumeDelta } = params;

  if (!hasWork) return "abandoned";

  const completionRatio = totalRecommended > 0 ? matchedCount / totalRecommended : 1;
  const volumeFarBelowPlan = typeof volumeDelta === "number" && volumeDelta <= -40;

  if (completionRatio >= 0.85 && substitutionCount === 0 && missedCount === 0 && adherenceScore >= 85 && !volumeFarBelowPlan) {
    return "as_prescribed";
  }

  if (completionRatio < 0.5 || missedCount >= Math.max(2, Math.ceil(totalRecommended / 2)) || volumeFarBelowPlan) {
    return "partial";
  }

  return "modified";
}

export function daysBetweenDayStrings(laterDay: string | null | undefined, earlierDay: string | null | undefined): number | null {
  if (!laterDay || !earlierDay) return null;
  const later = new Date(`${laterDay}T00:00:00`);
  const earlier = new Date(`${earlierDay}T00:00:00`);
  const delta = later.getTime() - earlier.getTime();
  if (!Number.isFinite(delta)) return null;
  return Math.max(0, Math.round(delta / 86400000));
}

export function isoToDayString(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return null;
  }
}

export function derivePrimaryOutcome(params: {
  currentTopLoadLbs: number | null;
  currentTopReps: number | null;
  previousTopLoadLbs: number | null;
  previousTopReps: number | null;
}): PrimaryOutcome {
  const { currentTopLoadLbs, currentTopReps, previousTopLoadLbs, previousTopReps } = params;

  if (currentTopLoadLbs == null || currentTopReps == null || previousTopLoadLbs == null || previousTopReps == null) {
    return "unknown";
  }

  if (currentTopLoadLbs > previousTopLoadLbs) return "progressed";
  if (currentTopLoadLbs < previousTopLoadLbs) return "regressed";

  if (currentTopReps > previousTopReps) return "progressed";
  if (currentTopReps < previousTopReps) return "regressed";

  return "matched";
}

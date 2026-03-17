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


export type SessionFidelityBreakdown = {
  score: number;
  exerciseMatch: number;
  setCompletion: number;
  substitutionPenalty: number;
  anchorQuality: number;
  label: "High" | "Moderate" | "Low";
  note: string;
};

export function computeSessionFidelity(params: {
  matchedCount: number;
  totalRecommended: number;
  substitutionCount: number;
  missedCount: number;
  extrasCount: number;
  exerciseFidelity: Array<{
    recommendedSets: number | null;
    actualSets: number;
  }>;
  primaryOutcome: PrimaryOutcome;
  sessionOutcome: SessionOutcome;
}): SessionFidelityBreakdown {
  const {
    matchedCount,
    totalRecommended,
    substitutionCount,
    missedCount,
    extrasCount,
    exerciseFidelity,
    primaryOutcome,
    sessionOutcome,
  } = params;

  const exerciseMatch = totalRecommended > 0
    ? Math.max(0, Math.min(1, matchedCount / totalRecommended))
    : sessionOutcome === "abandoned"
      ? 0
      : 1;

  let prescribedSets = 0;
  let completedSets = 0;
  for (const row of exerciseFidelity || []) {
    const rec = typeof row.recommendedSets === "number" && Number.isFinite(row.recommendedSets)
      ? Math.max(0, row.recommendedSets)
      : 0;
    const actual = typeof row.actualSets === "number" && Number.isFinite(row.actualSets)
      ? Math.max(0, row.actualSets)
      : 0;
    prescribedSets += rec;
    completedSets += rec > 0 ? Math.min(actual, rec) : actual;
  }
  const setCompletion = prescribedSets > 0
    ? Math.max(0, Math.min(1, completedSets / prescribedSets))
    : exerciseMatch;

  const substitutionPressure = totalRecommended > 0
    ? (substitutionCount + missedCount * 1.25 + extrasCount * 0.5) / totalRecommended
    : 0;
  const substitutionPenalty = Math.max(0, Math.min(1, 1 - substitutionPressure));

  const anchorQuality = (
    primaryOutcome === "progressed" ? 1 :
    primaryOutcome === "matched" ? 0.9 :
    primaryOutcome === "unknown" ? 0.75 :
    0.45
  );

  let score = Math.round((exerciseMatch * 0.35 + setCompletion * 0.30 + substitutionPenalty * 0.20 + anchorQuality * 0.15) * 100);

  if (sessionOutcome === "abandoned") score = Math.min(score, 20);
  if (sessionOutcome === "partial") score = Math.min(score, 74);
  score = Math.max(0, Math.min(100, score));

  const label = score >= 85 ? "High" : score >= 65 ? "Moderate" : "Low";
  const note = label === "High"
    ? "Recommendation landed cleanly enough to trust the signal."
    : label === "Moderate"
      ? "Useful signal, but reality trimmed or bent parts of the prescription."
      : "Reality drifted far enough from plan that the brain should stay cautious.";

  return {
    score,
    exerciseMatch: Math.round(exerciseMatch * 100),
    setCompletion: Math.round(setCompletion * 100),
    substitutionPenalty: Math.round(substitutionPenalty * 100),
    anchorQuality: Math.round(anchorQuality * 100),
    label,
    note,
  };
}


export type SessionPatternProfile = {
  executionDiscipline: "high" | "moderate" | "low";
  loadAggression: "conservative" | "neutral" | "aggressive";
  volumeDrift: "low" | "moderate" | "high";
  substitutionPattern: "stable" | "selective" | "frequent";
  anchorReliability: "strong" | "mixed" | "weak";
};

export type SessionPatternEvidence = {
  fidelityAvg: number | null;
  avgLoadDelta: number | null;
  avgVolumeDelta: number | null;
  substitutionRate: number | null;
  anchorMatchRate: number | null;
};

type PatternHistoryItem = {
  fidelityScore?: number | null;
  loadDeltaAvg?: number | null;
  volumeDelta?: number | null;
  substitutionCount?: number | null;
  primaryOutcome?: "progressed" | "matched" | "regressed" | "unknown";
};

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function deriveSessionPatterns(history: PatternHistoryItem[] | undefined): {
  profile: SessionPatternProfile;
  evidence: SessionPatternEvidence;
} {
  const recent = (history ?? []).slice(-12);

  const fidelityAvg = avg(
    recent
      .map((item) => item.fidelityScore)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  );

  const avgLoadDelta = avg(
    recent
      .map((item) => item.loadDeltaAvg)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  );

  const avgVolumeDelta = avg(
    recent
      .map((item) => item.volumeDelta)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  );

  const substitutionObserved = recent.filter((item) => (item.substitutionCount ?? 0) > 0).length;
  const substitutionRate = recent.length > 0 ? substitutionObserved / recent.length : null;

  const anchorGood = recent.filter((item) => item.primaryOutcome === "matched" || item.primaryOutcome === "progressed").length;
  const anchorKnown = recent.filter((item) => item.primaryOutcome && item.primaryOutcome !== "unknown").length;
  const anchorMatchRate = anchorKnown > 0 ? anchorGood / anchorKnown : null;

  const executionDiscipline: SessionPatternProfile["executionDiscipline"] =
    fidelityAvg == null ? "moderate" : fidelityAvg >= 85 ? "high" : fidelityAvg >= 70 ? "moderate" : "low";

  const loadAggression: SessionPatternProfile["loadAggression"] =
    avgLoadDelta == null ? "neutral" : avgLoadDelta >= 2 ? "aggressive" : avgLoadDelta <= -2 ? "conservative" : "neutral";

  const volumeDriftMagnitude = avgVolumeDelta == null ? null : Math.abs(avgVolumeDelta);
  const volumeDrift: SessionPatternProfile["volumeDrift"] =
    volumeDriftMagnitude == null ? "moderate" : volumeDriftMagnitude < 10 ? "low" : volumeDriftMagnitude < 25 ? "moderate" : "high";

  const substitutionPattern: SessionPatternProfile["substitutionPattern"] =
    substitutionRate == null ? "selective" : substitutionRate < 0.15 ? "stable" : substitutionRate < 0.4 ? "selective" : "frequent";

  const anchorReliability: SessionPatternProfile["anchorReliability"] =
    anchorMatchRate == null ? "mixed" : anchorMatchRate >= 0.85 ? "strong" : anchorMatchRate >= 0.6 ? "mixed" : "weak";

  return {
    profile: {
      executionDiscipline,
      loadAggression,
      volumeDrift,
      substitutionPattern,
      anchorReliability,
    },
    evidence: {
      fidelityAvg,
      avgLoadDelta,
      avgVolumeDelta,
      substitutionRate,
      anchorMatchRate,
    },
  };
}

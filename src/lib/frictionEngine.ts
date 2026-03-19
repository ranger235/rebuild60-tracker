export type FrictionLevel = "low" | "moderate" | "high";
export type FrictionTrend = "up" | "flat" | "down" | null;

export type FrictionProfile = {
  score: number;
  level: FrictionLevel;
  drivers: string[];
  constraints: string[];
  reasons: string[];
  signals: {
    sessionGapDays: number | null;
    missedSessionPressure: number | null;
    fidelityScore: number | null;
    substitutionRate: number | null;
    anchorReliability: number | null;
    readinessScore: number | null;
    readinessTrend: FrictionTrend;
    momentum: FrictionTrend;
  };
  recommendations: {
    progressionCap: "normal" | "soft" | "hold";
    volumeCap: "normal" | "soft" | "reduced";
    noveltyCap: "normal" | "reduced" | "minimal";
    anchorDemand: "normal" | "protect" | "preserve";
  };
};

export type FrictionInput = {
  asOf: string;
  readiness?: {
    score?: number | null;
    trend?: FrictionTrend;
  };
  behavior?: {
    fidelity?: number | null;
    substitutionRate?: number | null;
    anchorReliability?: number | null;
  };
  execution?: {
    daysSinceLastWorkout?: number | null;
    expectedSessions?: number | null;
    completedSessions?: number | null;
    recentMissedSessions?: number | null;
  };
  progress?: {
    momentum?: FrictionTrend;
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function scoreSessionGap(days: number | null): number {
  if (days == null || !Number.isFinite(days)) return 10;
  if (days <= 2) return 4;
  if (days <= 4) return 18;
  if (days <= 6) return 32;
  return 42;
}

function scoreMissedSessionPressure(expected: number | null, completed: number | null, missed: number | null): number {
  const exp = expected ?? 0;
  const comp = completed ?? 0;
  const m = missed ?? Math.max(0, exp - comp);
  if (exp <= 0) return 6;
  const ratio = Math.max(0, Math.min(1, m / Math.max(1, exp)));
  return clamp(ratio * 28, 0, 28);
}

function scoreFidelityDrag(fidelity: number | null): number {
  if (fidelity == null || !Number.isFinite(fidelity)) return 8;
  if (fidelity >= 85) return 2;
  if (fidelity >= 70) return 8;
  if (fidelity >= 55) return 18;
  return 28;
}

function scoreSubstitutionDrag(rate: number | null): number {
  if (rate == null || !Number.isFinite(rate)) return 6;
  if (rate <= 0.12) return 2;
  if (rate <= 0.25) return 8;
  if (rate <= 0.4) return 16;
  return 24;
}

function scoreAnchorInstability(anchorReliability: number | null): number {
  if (anchorReliability == null || !Number.isFinite(anchorReliability)) return 8;
  if (anchorReliability >= 85) return 2;
  if (anchorReliability >= 70) return 8;
  if (anchorReliability >= 55) return 16;
  return 24;
}

function scoreReadinessDrag(score: number | null, trend: FrictionTrend): number {
  let drag = 0;
  if (score == null || !Number.isFinite(score)) drag += 8;
  else if (score >= 80) drag += 2;
  else if (score >= 65) drag += 8;
  else if (score >= 50) drag += 16;
  else drag += 24;

  if (trend === "down") drag += 8;
  if (trend === "up") drag -= 2;
  return clamp(drag, 0, 28);
}

function scoreMomentumDrag(momentum: FrictionTrend): number {
  if (momentum === "down") return 10;
  if (momentum === "flat") return 4;
  if (momentum === "up") return 0;
  return 5;
}

function classifyFrictionLevel(score: number): FrictionLevel {
  if (score >= 60) return "high";
  if (score >= 30) return "moderate";
  return "low";
}

function buildRecommendations(score: number, level: FrictionLevel, signals: FrictionProfile["signals"]): FrictionProfile["recommendations"] {
  if (level === "high") {
    return {
      progressionCap: "hold",
      volumeCap: "reduced",
      noveltyCap: "minimal",
      anchorDemand: signals.anchorReliability != null && signals.anchorReliability < 55 ? "preserve" : "protect",
    };
  }
  if (level === "moderate") {
    return {
      progressionCap: score >= 50 ? "hold" : "soft",
      volumeCap: signals.sessionGapDays != null && signals.sessionGapDays >= 5 ? "reduced" : "soft",
      noveltyCap: "reduced",
      anchorDemand: "protect",
    };
  }
  return {
    progressionCap: "normal",
    volumeCap: "normal",
    noveltyCap: "normal",
    anchorDemand: "normal",
  };
}

function buildDrivers(signals: FrictionProfile["signals"]): string[] {
  const out: string[] = [];
  if ((signals.sessionGapDays ?? 0) >= 5) out.push(`Session rhythm is broken (${signals.sessionGapDays} days since last workout).`);
  else if ((signals.sessionGapDays ?? 0) >= 3) out.push(`Training rhythm is a little loose (${signals.sessionGapDays} days since last workout).`);

  if ((signals.missedSessionPressure ?? 0) >= 18) out.push("Missed session pressure is elevated.");
  else if ((signals.missedSessionPressure ?? 0) >= 10) out.push("Recent adherence is softer than ideal.");

  if ((signals.fidelityScore ?? 100) < 70) out.push("Execution fidelity has slipped.");
  if ((signals.substitutionRate ?? 0) > 0.25) out.push("Substitution drift is rising.");
  if ((signals.anchorReliability ?? 100) < 70) out.push("Anchor reliability is soft.");
  if ((signals.readinessScore ?? 100) < 65) out.push("Readiness is not giving much runway.");
  if (signals.readinessTrend === "down") out.push("Readiness trend is drifting down.");
  if (signals.momentum === "down") out.push("Momentum is moving the wrong way.");
  return out.slice(0, 5);
}

function buildConstraints(level: FrictionLevel, rec: FrictionProfile["recommendations"]): string[] {
  const out: string[] = [];
  if (rec.progressionCap === "hold") out.push("Hold progression unless the evidence is obvious.");
  else if (rec.progressionCap === "soft") out.push("Keep progression on a short leash.");

  if (rec.volumeCap === "reduced") out.push("Trim accessory sprawl and keep the session tight.");
  else if (rec.volumeCap === "soft") out.push("Preserve the essentials and keep fluff under control.");

  if (rec.noveltyCap === "minimal") out.push("No cute exercise churn. Familiar patterns only.");
  else if (rec.noveltyCap === "reduced") out.push("Novelty budget is reduced until rhythm improves.");

  if (rec.anchorDemand === "preserve") out.push("Preserve anchor pattern identity without demanding heroics.");
  else if (rec.anchorDemand === "protect") out.push("Keep anchors in play, but protect execution quality.");

  if (level === "low" && out.length === 0) out.push("No major friction constraints. Let the block express normally.");
  return out;
}

function buildReasons(level: FrictionLevel, signals: FrictionProfile["signals"], rec: FrictionProfile["recommendations"]): string[] {
  const out: string[] = [];
  if (level === "high") {
    out.push("Reality is fighting the ideal plan right now, so the engine is protecting continuity first.");
  } else if (level === "moderate") {
    out.push("The week is usable, but not clean enough to push recklessly.");
  } else {
    out.push("There is enough rhythm and signal to let the block do its job.");
  }

  if ((signals.substitutionRate ?? 0) > 0.25 && rec.noveltyCap !== "normal") {
    out.push("When substitution drift rises, adding more novelty is just pouring gas on the mess.");
  }
  if ((signals.sessionGapDays ?? 0) >= 5 && rec.volumeCap !== "normal") {
    out.push("Broken rhythm means completion matters more than ideal volume right now.");
  }
  if ((signals.anchorReliability ?? 100) < 70 && rec.anchorDemand !== "normal") {
    out.push("Anchor work stays in, but the system is protecting completion before aggression.");
  }
  return out.slice(0, 3);
}

export function buildFrictionProfile(input: FrictionInput): FrictionProfile {
  const signals: FrictionProfile["signals"] = {
    sessionGapDays: input.execution?.daysSinceLastWorkout ?? null,
    missedSessionPressure: scoreMissedSessionPressure(
      input.execution?.expectedSessions ?? null,
      input.execution?.completedSessions ?? null,
      input.execution?.recentMissedSessions ?? null,
    ),
    fidelityScore: input.behavior?.fidelity ?? null,
    substitutionRate: input.behavior?.substitutionRate ?? null,
    anchorReliability: input.behavior?.anchorReliability ?? null,
    readinessScore: input.readiness?.score ?? null,
    readinessTrend: input.readiness?.trend ?? null,
    momentum: input.progress?.momentum ?? null,
  };

  const score = clamp(
    scoreSessionGap(signals.sessionGapDays)
      + (signals.missedSessionPressure ?? 0)
      + scoreFidelityDrag(signals.fidelityScore)
      + scoreSubstitutionDrag(signals.substitutionRate)
      + scoreAnchorInstability(signals.anchorReliability)
      + scoreReadinessDrag(signals.readinessScore, signals.readinessTrend)
      + scoreMomentumDrag(signals.momentum),
    0,
    100,
  );

  const level = classifyFrictionLevel(score);
  const recommendations = buildRecommendations(score, level, signals);
  const drivers = buildDrivers(signals);
  const constraints = buildConstraints(level, recommendations);
  const reasons = buildReasons(level, signals, recommendations);

  return {
    score,
    level,
    drivers,
    constraints,
    reasons,
    signals,
    recommendations,
  };
}

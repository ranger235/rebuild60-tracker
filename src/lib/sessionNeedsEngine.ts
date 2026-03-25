export type NeedKey =
  | "horizontalPress"
  | "verticalPress"
  | "row"
  | "verticalPull"
  | "quadDominant"
  | "hinge"
  | "biceps"
  | "triceps"
  | "delts"
  | "calves";

export type RecoveryBias = "green" | "yellow" | "red";

export type NeedScore = {
  key: NeedKey;
  score: number;
  reasons: string[];
};

export type NeedSnapshot = {
  scores: Record<NeedKey, NeedScore>;
  ranked: NeedScore[];
  recoveryBias: RecoveryBias;
};

export type NeedEngineInput = {
  recentFocusCounts: {
    Push: number;
    Pull: number;
    Lower: number;
    Mixed: number;
  };
  neutralizeFocusBias?: boolean;
  recoveryScore: number;
  readinessScore: number;
  momentumScore: number;
  complianceScore?: number | null;
  trainingDays28?: number;
  weeklyCoach?: {
    sessionsThis: number;
    sessionsPrev: number;
    tonnageThis: number;
    tonnagePrev: number;
    setsThis: number;
    setsPrev: number;
  } | null;
  movementSignals?: Partial<
    Record<
      NeedKey,
      {
        recentSessions?: number;
        stalled?: boolean;
        progressing?: boolean;
        avgFatigueRising?: boolean;
        daysSinceHit?: number | null;
      }
    >
  >;
};

const NEED_KEYS: NeedKey[] = [
  "horizontalPress",
  "verticalPress",
  "row",
  "verticalPull",
  "quadDominant",
  "hinge",
  "biceps",
  "triceps",
  "delts",
  "calves",
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function baseNeedScore(key: NeedKey): number {
  switch (key) {
    case "horizontalPress":
    case "row":
    case "quadDominant":
      return 55;
    case "verticalPress":
    case "verticalPull":
    case "hinge":
      return 50;
    case "biceps":
    case "triceps":
    case "delts":
      return 44;
    case "calves":
      return 40;
    default:
      return 45;
  }
}

function recoveryBiasFromScore(recoveryScore: number): RecoveryBias {
  if (recoveryScore >= 75) return "green";
  if (recoveryScore >= 55) return "yellow";
  return "red";
}

function recentBucketPenalty(
  key: NeedKey,
  recentFocusCounts: NeedEngineInput["recentFocusCounts"]
): { penalty: number; reason?: string } {
  if (
    key === "horizontalPress" ||
    key === "verticalPress" ||
    key === "triceps" ||
    key === "delts"
  ) {
    const push = recentFocusCounts.Push ?? 0;
    const penalty = push >= 8 ? 10 : push >= 6 ? 5 : 0;
    return penalty > 0
      ? {
          penalty,
          reason: `Push-pattern work has been hit ${push} times recently, so pressing gets a small overuse penalty.`,
        }
      : { penalty };
  }

  if (key === "row" || key === "verticalPull" || key === "biceps") {
    const pull = recentFocusCounts.Pull ?? 0;
    const penalty = pull >= 8 ? 10 : pull >= 6 ? 5 : 0;
    return penalty > 0
      ? {
          penalty,
          reason: `Pull-pattern work has been hit ${pull} times recently, so back/arm pulling gets a small overuse penalty.`,
        }
      : { penalty };
  }

  if (key === "quadDominant" || key === "hinge" || key === "calves") {
    const lower = recentFocusCounts.Lower ?? 0;
    const penalty = lower >= 7 ? 10 : lower >= 5 ? 5 : 0;
    return penalty > 0
      ? {
          penalty,
          reason: `Lower-body work has been hit ${lower} times recently, so legs get a small overuse penalty.`,
        }
      : { penalty };
  }

  return { penalty: 0 };
}

function undertrainingBonus(
  key: NeedKey,
  recentFocusCounts: NeedEngineInput["recentFocusCounts"]
): { bonus: number; reason?: string } {
  if (
    key === "horizontalPress" ||
    key === "verticalPress" ||
    key === "triceps" ||
    key === "delts"
  ) {
    const push = recentFocusCounts.Push ?? 0;
    const bonus = push <= 3 ? 15 : push <= 5 ? 8 : 0;
    return bonus > 0
      ? {
          bonus,
          reason: `Push-pattern work has been relatively quiet recently, so pressing gets a stimulus bonus.`,
        }
      : { bonus };
  }

  if (key === "row" || key === "verticalPull" || key === "biceps") {
    const pull = recentFocusCounts.Pull ?? 0;
    const bonus = pull <= 3 ? 15 : pull <= 5 ? 8 : 0;
    return bonus > 0
      ? {
          bonus,
          reason: `Pull-pattern work looks underfed, so back/arm pulling gets a stimulus bonus.`,
        }
      : { bonus };
  }

  if (key === "quadDominant" || key === "hinge" || key === "calves") {
    const lower = recentFocusCounts.Lower ?? 0;
    const bonus = lower <= 2 ? 18 : lower <= 4 ? 10 : 0;
    return bonus > 0
      ? {
          bonus,
          reason: `Lower-body work is lagging, so legs get a bigger need bonus.`,
        }
      : { bonus };
  }

  return { bonus: 0 };
}

function recoveryCompatibility(
  key: NeedKey,
  recoveryBias: RecoveryBias
): { delta: number; reason?: string } {
  if (recoveryBias === "green") {
    if (key === "quadDominant" || key === "hinge") {
      return {
        delta: 8,
        reason: "Recovery is green, so costly lower-body work can be pushed safely.",
      };
    }
    return { delta: 3 };
  }

  if (recoveryBias === "yellow") {
    if (key === "quadDominant" || key === "hinge") {
      return {
        delta: -4,
        reason: "Recovery is only fair, so the heaviest lower-body work gets nudged down a bit.",
      };
    }
    if (key === "biceps" || key === "triceps" || key === "delts" || key === "calves") {
      return {
        delta: 4,
        reason: "Recovery is middling, so lower-cost accessory work becomes easier to justify.",
      };
    }
    return { delta: 0 };
  }

  if (key === "quadDominant" || key === "hinge") {
    return {
      delta: -15,
      reason: "Recovery is red, so heavy lower-body work gets a hard penalty.",
    };
  }
  if (key === "horizontalPress" || key === "row" || key === "verticalPull" || key === "verticalPress") {
    return {
      delta: -6,
      reason: "Recovery is red, so the biggest compound patterns get trimmed back.",
    };
  }
  return {
    delta: 8,
    reason: "Recovery is red, so lower-cost accessory work becomes more attractive.",
  };
}

function movementSignalDelta(
  key: NeedKey,
  movementSignals: NeedEngineInput["movementSignals"]
): { delta: number; reasons: string[] } {
  const signal = movementSignals?.[key];
  if (!signal) return { delta: 0, reasons: [] };

  let delta = 0;
  const reasons: string[] = [];

  if (signal.stalled) {
    delta += 12;
    reasons.push("Recent performance looks stalled here, so this pattern gets a push for more attention.");
  }

  if (signal.progressing) {
    delta += 6;
    reasons.push("This pattern is already moving well, so it stays attractive for continued momentum.");
  }

  if (signal.avgFatigueRising) {
    delta -= 6;
    reasons.push("Fatigue appears to be rising here, so the need score gets trimmed back a little.");
  }

  if (typeof signal.daysSinceHit === "number") {
    if (signal.daysSinceHit >= 10) {
      delta += 10;
      reasons.push(`It has been ${signal.daysSinceHit} days since this pattern was trained, so it gets a freshness bonus.`);
    } else if (signal.daysSinceHit <= 3) {
      delta -= 8;
      reasons.push("This pattern was trained very recently, so it gets a recency penalty.");
    }
  }

  return { delta, reasons };
}

function cadenceDelta(
  key: NeedKey,
  input: NeedEngineInput
): { delta: number; reason?: string } {
  const trainingDays28 = input.trainingDays28 ?? 0;
  const weeklySessions = input.weeklyCoach?.sessionsThis ?? 0;

  if (trainingDays28 <= 8 || weeklySessions <= 2) {
    if (key === "horizontalPress" || key === "row" || key === "quadDominant") {
      return {
        delta: 6,
        reason: "Training cadence is a bit light, so big anchor movements get a bump.",
      };
    }
  }

  return { delta: 0 };
}

export function computeNeedSnapshot(input: NeedEngineInput): NeedSnapshot {
  const recoveryBias = recoveryBiasFromScore(input.recoveryScore);
  const scores = {} as Record<NeedKey, NeedScore>;

  for (const key of NEED_KEYS) {
    let score = baseNeedScore(key);
    const reasons: string[] = [];

    const effectiveFocusCounts = input.neutralizeFocusBias
      ? { Push: 0, Pull: 0, Lower: 0, Mixed: 0 }
      : input.recentFocusCounts;

    const under = undertrainingBonus(key, effectiveFocusCounts);
    score += under.bonus;
    if (under.reason) reasons.push(under.reason);

    const bucket = recentBucketPenalty(key, effectiveFocusCounts);
    score -= bucket.penalty;
    if (bucket.reason) reasons.push(bucket.reason);

    const recovery = recoveryCompatibility(key, recoveryBias);
    score += recovery.delta;
    if (recovery.reason) reasons.push(recovery.reason);

    const movement = movementSignalDelta(key, input.movementSignals);
    score += movement.delta;
    reasons.push(...movement.reasons);

    const cadence = cadenceDelta(key, input);
    score += cadence.delta;
    if (cadence.reason) reasons.push(cadence.reason);

    if (input.momentumScore >= 85 && (key === "horizontalPress" || key === "row" || key === "quadDominant")) {
      score += 4;
      reasons.push("Momentum is high, so one of the main anchor patterns earns a small extra push.");
    }

    if (input.readinessScore < 60 && (key === "quadDominant" || key === "hinge")) {
      score -= 8;
      reasons.push("Readiness is soft, so the highest-cost lower patterns get trimmed down.");
    }

    scores[key] = {
      key,
      score: clamp(score, 0, 100),
      reasons,
    };
  }

  const ranked = Object.values(scores).sort((a, b) => b.score - a.score);

  return {
    scores,
    ranked,
    recoveryBias,
  };
}


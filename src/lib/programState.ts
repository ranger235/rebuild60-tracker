import type { BrainFocus, BrainSnapshot, FocusCounts } from "./brainEngine";
import type { ReadinessContext } from "./readinessTypes";

export type ProgramPhase = "build" | "push" | "consolidate" | "deload" | "pivot";

export type ProgramStateBias = {
  volume: "up" | "hold" | "down";
  intensity: "up" | "hold" | "down";
  exerciseNovelty: "up" | "hold" | "down";
};

export type ProgramState = {
  phase: ProgramPhase;
  confidence: number;
  reasons: string[];
  primaryFocus: string[];
  constraints: string[];
  recommendedBias: ProgramStateBias;
  stateScore: number;
  reviewWindow: {
    recentDays: number;
    generatedAt: string;
  };
};

export type ProgramStateInput = {
  readiness: ReadinessContext;
  brainSnapshot: BrainSnapshot;
  recentFocusCounts: FocusCounts;
  trainingDays28: number;
  weeklyCoach: {
    sessionsThis: number;
    sessionsPrev: number;
    tonnageThis: number;
    tonnagePrev: number;
    setsThis: number;
    setsPrev: number;
  };
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function titleCase(input: string) {
  return input
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function nextFocusLabel(nextFocus: string) {
  if (!nextFocus) return "Base work";
  return nextFocus.includes("+") ? nextFocus : titleCase(nextFocus);
}

function underrepresentedFocus(counts: FocusCounts): Exclude<BrainFocus, "Mixed"> {
  const entries: Array<[Exclude<BrainFocus, "Mixed">, number]> = [
    ["Push", counts.Push],
    ["Pull", counts.Pull],
    ["Lower", counts.Lower],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}

function recentMomentumSignal(input: ProgramStateInput) {
  const { weeklyCoach } = input;
  const tonnageDelta = weeklyCoach.tonnagePrev > 0
    ? (weeklyCoach.tonnageThis - weeklyCoach.tonnagePrev) / weeklyCoach.tonnagePrev
    : weeklyCoach.tonnageThis > 0
    ? 0.2
    : 0;

  const setDelta = weeklyCoach.setsPrev > 0
    ? (weeklyCoach.setsThis - weeklyCoach.setsPrev) / weeklyCoach.setsPrev
    : weeklyCoach.setsThis > 0
    ? 0.2
    : 0;

  return {
    tonnageDelta,
    setDelta,
    combined: tonnageDelta * 0.65 + setDelta * 0.35,
  };
}

function derivePhase(input: ProgramStateInput): ProgramPhase {
  const { readiness, brainSnapshot, weeklyCoach, trainingDays28 } = input;
  const momentum = recentMomentumSignal(input);

  if (
    readiness.status === "low_signal_confidence" ||
    trainingDays28 < 6 ||
    readiness.patterns.substitutionPattern === "frequent"
  ) {
    return "pivot";
  }

  if (
    readiness.status === "recovery_constrained" ||
    brainSnapshot.recovery.score < 55 ||
    (readiness.watchFlags.some((flag) => flag.severity === "high") && weeklyCoach.sessionsThis >= 4)
  ) {
    return "deload";
  }

  if (
    readiness.status === "watch_fatigue" ||
    readiness.patterns.volumeDrift === "high" ||
    readiness.patterns.anchorReliability === "weak" ||
    readiness.patterns.loadAggression === "aggressive"
  ) {
    return "consolidate";
  }

  if (
    readiness.status === "ready_to_push" &&
    brainSnapshot.readiness.score >= 82 &&
    brainSnapshot.momentum.score >= 80 &&
    readiness.patterns.executionDiscipline === "high" &&
    readiness.patterns.anchorReliability === "strong" &&
    momentum.combined >= 0
  ) {
    return "push";
  }

  return "build";
}

function deriveBias(phase: ProgramPhase, readiness: ReadinessContext): ProgramStateBias {
  if (phase === "push") {
    return {
      volume: readiness.patterns.volumeDrift === "low" ? "up" : "hold",
      intensity: "up",
      exerciseNovelty: "down",
    };
  }

  if (phase === "build") {
    return {
      volume: "up",
      intensity: "hold",
      exerciseNovelty: readiness.patterns.substitutionPattern === "stable" ? "hold" : "down",
    };
  }

  if (phase === "consolidate") {
    return {
      volume: "hold",
      intensity: "hold",
      exerciseNovelty: "down",
    };
  }

  if (phase === "deload") {
    return {
      volume: "down",
      intensity: "down",
      exerciseNovelty: "hold",
    };
  }

  return {
    volume: "hold",
    intensity: "down",
    exerciseNovelty: "up",
  };
}

function deriveReasons(phase: ProgramPhase, input: ProgramStateInput): string[] {
  const { readiness, brainSnapshot, weeklyCoach } = input;
  const momentum = recentMomentumSignal(input);
  const reasons: string[] = [];

  if (phase === "push") {
    reasons.push(
      `Readiness is ${brainSnapshot.readiness.score} with ${brainSnapshot.recovery.score} recovery, so the system has enough runway to press progression.`
    );
    reasons.push(
      `Execution discipline is ${titleCase(readiness.patterns.executionDiscipline)} and anchor reliability is ${titleCase(readiness.patterns.anchorReliability)}, which means the written work is actually landing.`
    );
    if (momentum.combined >= 0.04) {
      reasons.push("Weekly set and tonnage trends are climbing together, so the block has permission to lean into harder loading.");
    }
    return reasons;
  }

  if (phase === "build") {
    reasons.push(
      `The system has enough signal to build, but not enough clean evidence to force a hard push yet.`
    );
    reasons.push(
      `Momentum sits at ${brainSnapshot.momentum.score} and recent compliance is ${brainSnapshot.compliance.score}, so the smart play is to stack productive weeks instead of swinging for the fence.`
    );
    return reasons;
  }

  if (phase === "consolidate") {
    reasons.push(
      `The last few weeks are productive, but fatigue or execution friction says hold the line before trying to pile more on.`
    );
    if (readiness.patterns.volumeDrift === "high") {
      reasons.push("Accessory volume keeps drifting, so this block should make the current work more repeatable before adding more of it.");
    }
    if (readiness.patterns.anchorReliability === "weak") {
      reasons.push("Primary lift reliability is soft, so the engine should stabilize repeated exposures instead of chasing novelty.");
    }
    return reasons;
  }

  if (phase === "deload") {
    reasons.push(
      `Recovery context is poor enough that the system should preserve movement quality and cut fatigue before it starts lying to itself.`
    );
    reasons.push(
      `This week shows ${weeklyCoach.sessionsThis} sessions and ${weeklyCoach.setsThis} sets, while readiness flags are pointing toward a recovery bottleneck.`
    );
    return reasons;
  }

  reasons.push("Signal confidence is too thin or too messy to pretend the current block should stay on the same rails.");
  reasons.push("When reality gets muddy, the right move is to reset the context and rebuild a cleaner signal instead of cosplaying certainty.");
  return reasons;
}

function deriveConstraints(phase: ProgramPhase, input: ProgramStateInput): string[] {
  const { readiness } = input;
  const constraints: string[] = [];

  if (readiness.patterns.substitutionPattern !== "stable") {
    constraints.push(`Exercise substitutions are ${titleCase(readiness.patterns.substitutionPattern).toLowerCase()}, so keep the menu tighter than your impulses.`);
  }
  if (readiness.patterns.volumeDrift !== "low") {
    constraints.push(`Accessory volume drift is ${titleCase(readiness.patterns.volumeDrift).toLowerCase()}, so do not write checks the back half of the session cannot cash.`);
  }
  if (readiness.metrics.recentFidelityAvg != null && readiness.metrics.recentFidelityAvg < 75) {
    constraints.push(`Recent fidelity is ${Math.round(readiness.metrics.recentFidelityAvg)}%, so the block should respect what actually gets finished.`);
  }
  if (phase === "deload") {
    constraints.push("Do not treat reduced volume as a challenge coin. Cut enough work to let the next wave mean something.");
  }
  if (phase === "pivot") {
    constraints.push("Do not pretend low-signal weeks deserve precise progression math. Rebuild rhythm first.");
  }
  if (constraints.length === 0) {
    constraints.push("No hard brake is flashing right now, but keep the work boring enough to repeat.");
  }

  return constraints.slice(0, 3);
}

function derivePrimaryFocus(input: ProgramStateInput): string[] {
  const focusItems = [nextFocusLabel(input.brainSnapshot.nextFocus)];
  const underHit = underrepresentedFocus(input.recentFocusCounts);
  if (!focusItems.some((item) => item.toLowerCase().includes(underHit.toLowerCase()))) {
    focusItems.push(`${underHit} exposure`);
  }

  if (input.brainSnapshot.recommendedSession.bias) {
    focusItems.push(input.brainSnapshot.recommendedSession.bias);
  }

  return focusItems.slice(0, 3);
}

function deriveConfidence(phase: ProgramPhase, input: ProgramStateInput): number {
  const coverageScore = clamp(input.readiness.metrics.signalCoverage * 100, 25, 100);
  const patternModifier =
    input.readiness.patterns.executionDiscipline === "high" ? 6 :
    input.readiness.patterns.executionDiscipline === "moderate" ? 0 : -8;
  const trustModifier =
    input.readiness.metrics.prescriptionTrust === "high" ? 6 :
    input.readiness.metrics.prescriptionTrust === "moderate" ? 0 :
    input.readiness.metrics.prescriptionTrust === "low" ? -8 : -4;
  const phaseModifier =
    phase === "pivot" ? -10 :
    phase === "deload" ? -4 :
    phase === "push" ? 4 : 0;

  return clamp(coverageScore + patternModifier + trustModifier + phaseModifier, 20, 98);
}

function deriveStateScore(phase: ProgramPhase, input: ProgramStateInput): number {
  const base =
    phase === "push" ? 86 :
    phase === "build" ? 72 :
    phase === "consolidate" ? 61 :
    phase === "deload" ? 44 : 38;

  const readinessShift = Math.round((input.brainSnapshot.readiness.score - 70) * 0.25);
  const recoveryShift = Math.round((input.brainSnapshot.recovery.score - 70) * 0.2);
  return clamp(base + readinessShift + recoveryShift, 15, 95);
}

export function formatProgramPhase(phase: ProgramPhase) {
  if (phase === "push") return "Push";
  if (phase === "build") return "Build";
  if (phase === "consolidate") return "Consolidate";
  if (phase === "deload") return "Deload";
  return "Pivot";
}

export function formatProgramBias(value: ProgramStateBias[keyof ProgramStateBias]) {
  if (value === "up") return "Up";
  if (value === "down") return "Down";
  return "Hold";
}

export function computeProgramState(input: ProgramStateInput): ProgramState {
  const phase = derivePhase(input);
  return {
    phase,
    confidence: deriveConfidence(phase, input),
    reasons: deriveReasons(phase, input),
    primaryFocus: derivePrimaryFocus(input),
    constraints: deriveConstraints(phase, input),
    recommendedBias: deriveBias(phase, input.readiness),
    stateScore: deriveStateScore(phase, input),
    reviewWindow: {
      recentDays: 28,
      generatedAt: new Date().toISOString(),
    },
  };
}

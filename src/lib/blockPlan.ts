import type { ProgramPhase, ProgramState } from "./programState";

export type BlockType =
  | "re_entry"
  | "strength_rebuild"
  | "hypertrophy_accumulation"
  | "movement_balance"
  | "fatigue_management";

export type WaveProfile = "ramp" | "stabilize" | "reload";

export type ActiveBlockPlan = {
  id: string;
  phase: ProgramPhase;
  blockType: BlockType;
  startedAt: string;
  targetDurationWeeks: number;
  currentWeekIndex: number;
  waveProfile: WaveProfile;
  emphasis: string[];
  constraints: string[];
  reasons: string[];
  directives: {
    progressionPressure: number;
    volumePressure: number;
    noveltyAllowance: number;
    anchorStrictness: number;
    balanceCorrectionPressure: number;
    fatigueCaution: number;
  };
  rotationRules: {
    minAnchorExposure: number;
    minPrimaryAccessoryExposure: number;
    noveltyBudgetPerWeek: number;
    forcedCarryPatterns: string[];
  };
};

export type BlockPlanInput = {
  asOf: string;
  programState: ProgramState;
  previousBlockPlan?: ActiveBlockPlan | null;
  readiness?: {
    score?: number | null;
    trend?: "up" | "flat" | "down" | null;
  };
  behavior?: {
    fidelity?: number | null;
    substitutionRate?: number | null;
    anchorReliability?: number | null;
  };
  progress?: {
    momentum?: "up" | "flat" | "down" | null;
    scorecardTrend?: number | null;
  };
  movementDebt?: {
    topPatterns?: string[];
    severity?: number | null;
  };
  exposure?: {
    anchorLiftCount?: number | null;
    noveltyRate?: number | null;
  };
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

function titleCase(input: string) {
  return input
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function blockLabel(blockType: BlockType) {
  return titleCase(blockType.replace(/_/g, ' '));
}

export function formatBlockType(blockType: BlockType) {
  return blockLabel(blockType);
}

export function formatWaveProfile(wave: WaveProfile) {
  return titleCase(wave);
}

export function formatDirectivePressure(value: number): "Up" | "Hold" | "Down" {
  if (value >= 0.67) return "Up";
  if (value <= 0.33) return "Down";
  return "Hold";
}

function daysBetween(startYmd: string, endYmd: string) {
  const start = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  const ms = end.getTime() - start.getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : 0;
}

function computeCurrentWeekIndex(startedAt: string, asOf: string) {
  return Math.max(1, Math.floor(daysBetween(startedAt, asOf) / 7) + 1);
}

function chooseBlockType(input: BlockPlanInput): BlockType {
  const phase = input.programState.phase;
  const movementSeverity = input.movementDebt?.severity ?? 0;
  const fidelity = input.behavior?.fidelity ?? null;
  const substitutionRate = input.behavior?.substitutionRate ?? 0;
  const momentum = input.progress?.momentum ?? "flat";

  if (phase === "deload") return "fatigue_management";
  if (phase === "pivot") {
    if (movementSeverity >= 0.6) return "movement_balance";
    return fidelity != null && fidelity < 65 ? "re_entry" : "movement_balance";
  }
  if (phase === "push") {
    return momentum === "up" ? "strength_rebuild" : "hypertrophy_accumulation";
  }
  if (phase === "consolidate") {
    return movementSeverity >= 0.55 ? "movement_balance" : "strength_rebuild";
  }

  if (movementSeverity >= 0.65) return "movement_balance";
  if ((fidelity != null && fidelity < 68) || substitutionRate > 0.35) return "re_entry";
  return "strength_rebuild";
}

function chooseWaveProfile(input: BlockPlanInput, blockType: BlockType): WaveProfile {
  if (input.programState.phase === "deload" || blockType === "fatigue_management") return "reload";
  if (input.programState.phase === "consolidate" || blockType === "movement_balance") return "stabilize";
  return "ramp";
}

function chooseDurationWeeks(input: BlockPlanInput, blockType: BlockType) {
  if (blockType === "fatigue_management") return 1;
  if (blockType === "re_entry") return 2;
  if (input.programState.phase === "push") return 3;
  if (blockType === "movement_balance") return 4;
  return 4;
}

function buildDirectives(input: BlockPlanInput, blockType: BlockType, waveProfile: WaveProfile) {
  const phase = input.programState.phase;
  const movementSeverity = input.movementDebt?.severity ?? 0;
  const fidelity = input.behavior?.fidelity ?? 72;
  const substitutionRate = input.behavior?.substitutionRate ?? 0.15;
  const anchorReliability = input.behavior?.anchorReliability ?? 0.65;
  const readinessScore = input.readiness?.score ?? 70;

  let progressionPressure = 0.55;
  let volumePressure = 0.55;
  let noveltyAllowance = 0.22;
  let anchorStrictness = 0.68;
  let balanceCorrectionPressure = clamp(0.35 + movementSeverity * 0.55);
  let fatigueCaution = clamp(0.35 + Math.max(0, (70 - readinessScore) / 100));

  if (phase === "push") {
    progressionPressure = 0.84;
    volumePressure = 0.58;
    noveltyAllowance = 0.12;
    anchorStrictness = 0.88;
    fatigueCaution = clamp(fatigueCaution + 0.08);
  } else if (phase === "build") {
    progressionPressure = 0.58;
    volumePressure = 0.68;
    noveltyAllowance = 0.24;
    anchorStrictness = 0.74;
  } else if (phase === "consolidate") {
    progressionPressure = 0.42;
    volumePressure = 0.44;
    noveltyAllowance = 0.14;
    anchorStrictness = 0.82;
    fatigueCaution = clamp(fatigueCaution + 0.16);
  } else if (phase === "deload") {
    progressionPressure = 0.08;
    volumePressure = 0.14;
    noveltyAllowance = 0.05;
    anchorStrictness = 0.74;
    balanceCorrectionPressure = 0.3;
    fatigueCaution = 0.93;
  } else if (phase === "pivot") {
    progressionPressure = 0.28;
    volumePressure = 0.34;
    noveltyAllowance = 0.38;
    anchorStrictness = 0.6;
    fatigueCaution = clamp(fatigueCaution + 0.1);
  }

  if (blockType === "movement_balance") {
    balanceCorrectionPressure = clamp(balanceCorrectionPressure + 0.2);
    noveltyAllowance = Math.min(noveltyAllowance, 0.2);
  }
  if (blockType === "re_entry") {
    progressionPressure = Math.min(progressionPressure, 0.35);
    volumePressure = Math.min(volumePressure, 0.4);
    noveltyAllowance = Math.min(noveltyAllowance, 0.18);
    anchorStrictness = Math.max(anchorStrictness, 0.74);
  }
  if (blockType === "hypertrophy_accumulation") {
    volumePressure = clamp(volumePressure + 0.1);
    progressionPressure = clamp(progressionPressure - 0.08);
  }

  if (waveProfile === "stabilize") {
    noveltyAllowance = Math.min(noveltyAllowance, 0.14);
    anchorStrictness = Math.max(anchorStrictness, 0.8);
  }
  if (waveProfile === "reload") {
    progressionPressure = Math.min(progressionPressure, 0.15);
    volumePressure = Math.min(volumePressure, 0.2);
    noveltyAllowance = Math.min(noveltyAllowance, 0.08);
  }

  if (fidelity < 65) {
    progressionPressure = Math.min(progressionPressure, 0.4);
    noveltyAllowance = Math.min(noveltyAllowance, 0.15);
    anchorStrictness = Math.max(anchorStrictness, 0.78);
  }
  if (substitutionRate > 0.3) {
    noveltyAllowance = Math.min(noveltyAllowance, 0.12);
    anchorStrictness = Math.max(anchorStrictness, 0.8);
  }
  if (anchorReliability < 0.55) {
    anchorStrictness = Math.max(anchorStrictness, 0.84);
  }

  return {
    progressionPressure: clamp(progressionPressure),
    volumePressure: clamp(volumePressure),
    noveltyAllowance: clamp(noveltyAllowance),
    anchorStrictness: clamp(anchorStrictness),
    balanceCorrectionPressure: clamp(balanceCorrectionPressure),
    fatigueCaution: clamp(fatigueCaution),
  };
}

function buildRotationRules(input: BlockPlanInput, blockType: BlockType, directives: ActiveBlockPlan["directives"]) {
  const noveltyRate = input.exposure?.noveltyRate ?? 0.2;
  const carryPatterns = (input.movementDebt?.topPatterns ?? []).slice(0, 2);
  const noveltyBudgetBase = directives.noveltyAllowance <= 0.12 ? 1 : directives.noveltyAllowance <= 0.24 ? 2 : 3;
  return {
    minAnchorExposure: blockType === "fatigue_management" ? 2 : directives.anchorStrictness >= 0.8 ? 4 : 3,
    minPrimaryAccessoryExposure: blockType === "re_entry" ? 2 : 3,
    noveltyBudgetPerWeek: Math.max(1, Math.min(3, noveltyBudgetBase - (noveltyRate > 0.35 ? 1 : 0))),
    forcedCarryPatterns: carryPatterns,
  };
}

function buildEmphasis(input: BlockPlanInput, blockType: BlockType): string[] {
  const emphasis: string[] = [];
  if (blockType === "strength_rebuild") emphasis.push("Repeat anchor lifts");
  if (blockType === "hypertrophy_accumulation") emphasis.push("Accumulate productive volume");
  if (blockType === "movement_balance") emphasis.push("Correct undertrained patterns");
  if (blockType === "fatigue_management") emphasis.push("Preserve patterns with lower demand");
  if (blockType === "re_entry") emphasis.push("Re-establish repeatable sessions");

  for (const pattern of input.movementDebt?.topPatterns ?? []) {
    emphasis.push(`Carry ${titleCase(pattern)} work`);
  }
  if ((input.behavior?.anchorReliability ?? 1) < 0.55) emphasis.push("Stabilize anchor exercise selection");
  if ((input.behavior?.fidelity ?? 100) < 70) emphasis.push("Tighten session fidelity");

  return Array.from(new Set(emphasis)).slice(0, 4);
}

function buildConstraints(input: BlockPlanInput, directives: ActiveBlockPlan["directives"]): string[] {
  const constraints: string[] = [];
  if ((input.behavior?.substitutionRate ?? 0) > 0.25) constraints.push("Keep substitutions on a short leash");
  if ((input.behavior?.fidelity ?? 100) < 68) constraints.push("Do not chase progression until execution settles");
  if (directives.fatigueCaution >= 0.75) constraints.push("Protect recovery and cap total demand");
  if (directives.noveltyAllowance <= 0.14) constraints.push("Limit exercise churn");
  if ((input.movementDebt?.severity ?? 0) >= 0.55) constraints.push("Do not let lagging patterns fall out of the week");
  return constraints.slice(0, 4);
}

function buildReasons(input: BlockPlanInput, blockType: BlockType, waveProfile: WaveProfile, directives: ActiveBlockPlan["directives"], continued: boolean): string[] {
  const reasons = [
    `${formatBlockType(blockType)} is the best fit for a ${input.programState.phase} state right now.`,
    `Wave profile is ${formatWaveProfile(waveProfile)} because progression pressure is ${formatDirectivePressure(directives.progressionPressure).toLowerCase()} while fatigue caution is ${formatDirectivePressure(directives.fatigueCaution).toLowerCase()}.`,
  ];
  if ((input.movementDebt?.topPatterns ?? []).length > 0) {
    reasons.push(`Movement debt is still sitting in ${input.movementDebt?.topPatterns?.map((item) => titleCase(item)).join(', ')}, so the block keeps those patterns in the carry bag.`);
  }
  if ((input.behavior?.substitutionRate ?? 0) > 0.25) {
    reasons.push("Recent substitutions are high enough that the engine should stop pretending novelty is free.");
  }
  if (continued) {
    reasons.push("The previous block was still earning its keep, so the system kept the same lane instead of rotating for entertainment value.");
  }
  return reasons.slice(0, 4);
}

function sameBlockShape(a: ActiveBlockPlan, phase: ProgramPhase, blockType: BlockType, waveProfile: WaveProfile) {
  return a.phase === phase && a.blockType === blockType && a.waveProfile === waveProfile;
}

export function buildActiveBlockPlan(input: BlockPlanInput): ActiveBlockPlan {
  const blockType = chooseBlockType(input);
  const waveProfile = chooseWaveProfile(input, blockType);
  const targetDurationWeeks = chooseDurationWeeks(input, blockType);

  let startedAt = input.asOf;
  let previousId: string | null = null;
  let continued = false;
  const previous = input.previousBlockPlan ?? null;
  if (
    previous &&
    sameBlockShape(previous, input.programState.phase, blockType, waveProfile) &&
    computeCurrentWeekIndex(previous.startedAt, input.asOf) <= previous.targetDurationWeeks
  ) {
    startedAt = previous.startedAt;
    previousId = previous.id;
    continued = true;
  }

  const directives = buildDirectives(input, blockType, waveProfile);
  const rotationRules = buildRotationRules(input, blockType, directives);
  const currentWeekIndex = Math.min(targetDurationWeeks, computeCurrentWeekIndex(startedAt, input.asOf));
  const emphasis = buildEmphasis(input, blockType);
  const constraints = buildConstraints(input, directives);
  const reasons = buildReasons(input, blockType, waveProfile, directives, continued);

  return {
    id: previousId ?? `block-${input.asOf}-${input.programState.phase}-${blockType}`,
    phase: input.programState.phase,
    blockType,
    startedAt,
    targetDurationWeeks,
    currentWeekIndex,
    waveProfile,
    emphasis,
    constraints,
    reasons,
    directives,
    rotationRules,
  };
}

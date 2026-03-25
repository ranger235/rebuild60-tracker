import type { FrictionProfile } from "./frictionEngine";
import type { BrainFocus, ExerciseHistory } from "./brainEngine";
import type { NeedKey, RecoveryBias } from "./sessionNeedsEngine";

export type NextSessionPriorityCategory =
  | "anchor_progression"
  | "movement_balance"
  | "volume_reinforcement"
  | "pattern_repeat"
  | "fatigue_containment"
  | "continuity_recovery";

export type NextSessionPriority = {
  category: NextSessionPriorityCategory;
  target: string;
  priorityScore: number;
  reasons: string[];
};

export type NextSessionPriorityProfile = {
  asOf: string;
  topPriorities: NextSessionPriority[];
  deprioritized: string[];
  constraintsApplied: string[];
  rationaleSummary: string[];
};

export type NextSessionPriorityInput = {
  asOf: string;
  focus: Exclude<BrainFocus, "Mixed">;
  sessionType?: string | null;
  mode: "Progression" | "Base" | "Reduced volume";
  topNeeds: NeedKey[];
  recoveryBias: RecoveryBias;
  frictionProfile?: FrictionProfile | null;
  weeklyCoach?: {
    sessionsThis: number;
    sessionsPrev: number;
    tonnageThis: number;
    tonnagePrev: number;
    setsThis: number;
    setsPrev: number;
  } | null;
  exerciseHistory: ExerciseHistory[];
};

const NEED_LABELS: Record<NeedKey, string> = {
  horizontalPress: "horizontal press",
  verticalPress: "vertical press",
  row: "row",
  verticalPull: "vertical pull",
  quadDominant: "quad dominant",
  hinge: "hinge",
  biceps: "biceps",
  triceps: "triceps",
  delts: "delts",
  calves: "calves",
};


function sessionTypeLabel(input: NextSessionPriorityInput): string | null {
  const label = String(input.sessionType || "").trim();
  return label ? label : null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function labelNeed(key?: NeedKey | null): string {
  if (!key) return "main pattern";
  return NEED_LABELS[key] ?? key;
}

function sessionGapDays(history: ExerciseHistory[]): number | null {
  const values = history
    .map((h) => h.lastPerformedDaysAgo)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!values.length) return null;
  return Math.min(...values);
}

function anchorReliability(history: ExerciseHistory[], focus: Exclude<BrainFocus, "Mixed">): number {
  const relevant = history.filter((h) => h.focus === focus);
  if (!relevant.length) return 55;
  const reliable = relevant.filter((h) => (h.recentSets ?? 0) >= 6 || (h.lastPerformedDaysAgo ?? 99) <= 10).length;
  return clamp((reliable / relevant.length) * 100, 35, 95);
}

function progressionOpportunity(history: ExerciseHistory[], focus: Exclude<BrainFocus, "Mixed">): number {
  const relevant = history.filter((h) => h.focus === focus);
  let score = 0;
  for (const item of relevant) {
    const top = item.recentTopSetE1RMs ?? [];
    if (top.length >= 3) {
      const [a, b, c] = top.slice(-3);
      const prior = Math.max(a, b);
      const delta = prior > 0 ? (c - prior) / prior : 0;
      if (delta > 0.015) score += 16;
      else if (delta > -0.005) score += 8;
    } else if ((item.recentSets ?? 0) >= 6) {
      score += 6;
    }
  }
  return clamp(score, 0, 100);
}

function scoreAnchorProgression(input: NextSessionPriorityInput): NextSessionPriority {
  const friction = input.frictionProfile;
  const reliability = anchorReliability(input.exerciseHistory, input.focus);
  const opportunity = progressionOpportunity(input.exerciseHistory, input.focus);
  let score = input.mode === "Progression" ? 72 : input.mode === "Base" ? 54 : 24;
  score += Math.round(opportunity * 0.24);
  score += Math.round((reliability - 60) * 0.18);
  if (friction?.recommendations.progressionCap === "hold") score -= 34;
  else if (friction?.recommendations.progressionCap === "soft") score -= 14;
  if (friction?.recommendations.anchorDemand === "preserve") score -= 12;
  if (friction?.level === "low") score += 6;

  return {
    category: "anchor_progression",
    target: sessionTypeLabel(input) ?? (input.focus === "Push" ? "main press anchor" : input.focus === "Pull" ? "main row / pull anchor" : "main squat / hinge anchor"),
    priorityScore: clamp(score, 0, 100),
    reasons: [
      opportunity >= 35 ? "A live progression path is showing in recent logged work." : "There is still room to earn another productive exposure.",
      reliability >= 70 ? "Anchor reliability is good enough to trust a push." : "Anchor reliability is usable, but not bulletproof.",
      friction?.recommendations.progressionCap === "hold" ? "Friction is holding progression on a short chain today." : "Nothing in the current friction profile is forbidding a push outright.",
    ],
  };
}

function scoreMovementBalance(input: NextSessionPriorityInput): NextSessionPriority {
  const primary = input.topNeeds[0] ?? null;
  const secondary = input.topNeeds[1] ?? null;
  const friction = input.frictionProfile;
  let score = 42;
  if (primary) score += 24;
  if (secondary) score += 10;
  if (input.recoveryBias === "green") score += 4;
  if (friction?.recommendations.noveltyCap === "minimal") score -= 6;
  if (friction?.recommendations.volumeCap === "reduced") score -= 4;

  return {
    category: "movement_balance",
    target: secondary ? `${labelNeed(primary)} + ${labelNeed(secondary)}` : labelNeed(primary),
    priorityScore: clamp(score, 0, 100),
    reasons: [
      primary ? `${labelNeed(primary)} is still sitting near the top of the deterministic need stack.` : "The engine still sees unresolved movement debt.",
      secondary ? `${labelNeed(secondary)} is also asking for another bite of work.` : "The current split does not need a giant corrective swing.",
      friction?.recommendations.volumeCap === "reduced" ? "Balance work still matters, but the week is not offering unlimited runway." : "There is enough room to keep structural balance moving forward.",
    ],
  };
}

function scorePatternRepeat(input: NextSessionPriorityInput): NextSessionPriority {
  const friction = input.frictionProfile;
  const focusHistCount = input.exerciseHistory.filter((h) => h.focus === input.focus && (h.recentSets ?? 0) >= 4).length;
  let score = 38;
  if (input.mode !== "Progression") score += 12;
  if (friction?.recommendations.noveltyCap === "minimal") score += 22;
  else if (friction?.recommendations.noveltyCap === "reduced") score += 14;
  if (focusHistCount >= 2) score += 10;

  return {
    category: "pattern_repeat",
    target: sessionTypeLabel(input)
      ? `repeat ${sessionTypeLabel(input)!.toLowerCase()} pattern`
      : (input.focus === "Push" ? "repeat pressing pattern" : input.focus === "Pull" ? "repeat pulling pattern" : "repeat lower pattern"),
    priorityScore: clamp(score, 0, 100),
    reasons: [
      focusHistCount >= 2 ? "There is enough recent exposure to make a repeat useful instead of stale." : "A clean repeat would build continuity faster than a cute rotation.",
      friction?.recommendations.noveltyCap === "minimal" ? "Novelty is on a very short leash, so repeat work gets more valuable." : "The block can benefit from another honest exposure before changing lanes.",
      input.mode === "Reduced volume" ? "Reduced-volume mode favors familiarity and clean execution." : "Pattern stability supports better signal quality next session.",
    ],
  };
}

function scoreVolumeReinforcement(input: NextSessionPriorityInput): NextSessionPriority {
  const friction = input.frictionProfile;
  const weeklySets = input.weeklyCoach?.setsThis ?? 0;
  let score = input.mode === "Base" ? 52 : input.mode === "Progression" ? 46 : 18;
  if (input.recoveryBias === "green") score += 8;
  if (weeklySets < 14) score += 12;
  if (friction?.recommendations.volumeCap === "soft") score -= 10;
  if (friction?.recommendations.volumeCap === "reduced") score -= 24;

  return {
    category: "volume_reinforcement",
    target: labelNeed(input.topNeeds[0] ?? null),
    priorityScore: clamp(score, 0, 100),
    reasons: [
      weeklySets < 14 ? "Recent weekly set exposure is light enough that another solid work dose has value." : "Volume can still reinforce progress without demanding a max-effort jump.",
      input.recoveryBias === "green" ? "Recovery bias is green enough to support more quality work." : "Volume only helps if it stays honest and recoverable.",
      friction?.recommendations.volumeCap === "reduced" ? "Friction is cutting the volume leash shorter today." : "Nothing in the current constraint layer says volume has to disappear.",
    ],
  };
}

function scoreFatigueContainment(input: NextSessionPriorityInput): NextSessionPriority {
  const friction = input.frictionProfile;
  let score = input.mode === "Reduced volume" ? 68 : 24;
  if (input.recoveryBias === "red") score += 18;
  else if (input.recoveryBias === "yellow") score += 8;
  if (friction?.level === "high") score += 18;
  else if (friction?.level === "moderate") score += 10;

  return {
    category: "fatigue_containment",
    target: "keep the next session crisp",
    priorityScore: clamp(score, 0, 100),
    reasons: [
      input.recoveryBias === "red" ? "Recovery bias is red enough that containment matters more than ambition." : "The engine still sees value in keeping some fatigue discipline around the next session.",
      friction?.level === "high" ? "The friction profile is loud enough that restraint deserves a seat at the table." : "Containment keeps a decent week from turning into a sloppy one.",
      input.mode === "Reduced volume" ? "Reduced-volume mode is already telling the truth about current conditions." : "A little discipline now preserves room for better work later.",
    ],
  };
}

function scoreContinuityRecovery(input: NextSessionPriorityInput): NextSessionPriority {
  const friction = input.frictionProfile;
  const gap = friction?.signals.sessionGapDays ?? sessionGapDays(input.exerciseHistory) ?? 0;
  let score = 16;
  if (gap >= 5) score += 42;
  else if (gap >= 3) score += 24;
  if ((friction?.signals.missedSessionPressure ?? 0) >= 18) score += 18;
  else if ((friction?.signals.missedSessionPressure ?? 0) >= 10) score += 10;
  if (friction?.recommendations.noveltyCap === "minimal") score += 8;

  return {
    category: "continuity_recovery",
    target: "get the train back on the rails",
    priorityScore: clamp(score, 0, 100),
    reasons: [
      gap >= 5 ? `It has been ${gap} days since the last logged session, so continuity matters.` : "Recent rhythm is not bad enough to make continuity the whole story.",
      (friction?.signals.missedSessionPressure ?? 0) >= 10 ? "Missed-session pressure says completion needs a win soon." : "The week is not screaming for a rescue session yet.",
      "When continuity wobbles, achievable and familiar beats ideal and theatrical.",
    ],
  };
}

function friendlyLabel(category: NextSessionPriorityCategory): string {
  switch (category) {
    case "anchor_progression": return "Anchor progression";
    case "movement_balance": return "Movement balance";
    case "volume_reinforcement": return "Volume reinforcement";
    case "pattern_repeat": return "Pattern repeat";
    case "fatigue_containment": return "Fatigue containment";
    case "continuity_recovery": return "Continuity recovery";
  }
}

export function buildNextSessionPriorityProfile(input: NextSessionPriorityInput): NextSessionPriorityProfile {
  const priorities = [
    scoreAnchorProgression(input),
    scoreMovementBalance(input),
    scorePatternRepeat(input),
    scoreVolumeReinforcement(input),
    scoreFatigueContainment(input),
    scoreContinuityRecovery(input),
  ].sort((a, b) => b.priorityScore - a.priorityScore);

  const topPriorities = priorities.slice(0, 3);
  const deprioritized = priorities.slice(-2).map((item) => `${friendlyLabel(item.category)} can wait a beat.`);
  const constraintsApplied = [
    input.frictionProfile?.recommendations.progressionCap !== "normal" ? `Progression cap: ${input.frictionProfile?.recommendations.progressionCap}` : null,
    input.frictionProfile?.recommendations.volumeCap !== "normal" ? `Volume cap: ${input.frictionProfile?.recommendations.volumeCap}` : null,
    input.frictionProfile?.recommendations.noveltyCap !== "normal" ? `Novelty cap: ${input.frictionProfile?.recommendations.noveltyCap}` : null,
    input.frictionProfile?.recommendations.anchorDemand !== "normal" ? `Anchor demand: ${input.frictionProfile?.recommendations.anchorDemand}` : null,
  ].filter((item): item is string => !!item);

  const rationaleSummary = topPriorities.map((item) => `${friendlyLabel(item.category)} rises because ${item.reasons[0].toLowerCase()}`);

  return {
    asOf: input.asOf,
    topPriorities,
    deprioritized,
    constraintsApplied: constraintsApplied.length ? constraintsApplied : ["No major friction caps are limiting the next session."],
    rationaleSummary,
  };
}


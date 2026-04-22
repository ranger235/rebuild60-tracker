import {
  candidatesForSlot,
  scoreCandidateForSlot,
  type Slot,
} from "./slotEngine";
import {
  applyPreferenceSignalsToNeeds,
  type PreferenceSignals,
} from "./preferenceLearning";
import {
  applyMovementDebtToNeeds,
  computeMovementDebtSnapshot,
} from "./movementDebt";
import {
  computeNeedSnapshot,
  type NeedEngineInput,
  type NeedKey,
} from "./sessionNeedsEngine";
import { composeAdaptiveSession } from "./sessionComposer";
import { applyNeedWeightProfile, deriveNeedWeightProfile } from "./needWeights";
import type { FrictionProfile } from "./frictionEngine";
import { buildNextSessionPriorityProfile, type NextSessionPriorityProfile } from "./nextSessionPriority";
import {
  applyMovementOverlapPenalty,
  broadenCandidatesForCoveredSlot,
  getMovementFamilyForExerciseKey,
} from "./movementOverlap";

export type BrainFocus = "Push" | "Pull" | "Lower" | "Mixed";

export type FocusCounts = {
  Push: number;
  Pull: number;
  Lower: number;
  Mixed: number;
};

export type ExerciseHistory = {
  key: string;
  name: string;
  focus: BrainFocus;
  lastLoad: number | null;
  lastReps: number | null;
  recentSets: number;
  recentBestE1RM: number | null;
  lastPerformedDaysAgo: number | null;
  recentTopSetE1RMs?: number[];
  recentAvgSetReps?: number[];
};

export type SplitDayDefinition = {
  id: string;
  name: string;
  slots: Slot[];
};

export type TrainingSplitConfig = {
  preset: "ppl" | "bro" | "custom";
  days: SplitDayDefinition[];
};

export type BrainInput = {
  sleepAvg7: number | null;
  proteinAvg7: number | null;
  trainingDays28: number;
  weeklyCoach: {
    sessionsThis: number;
    sessionsPrev: number;
    tonnageThis: number;
    tonnagePrev: number;
    setsThis: number;
    setsPrev: number;
  } | null;
  recentFocusCounts: FocusCounts;
  lastSessionFocus: BrainFocus | null;
  exerciseHistory: ExerciseHistory[];
  preferenceSignals?: PreferenceSignals | null;
  frictionProfile?: FrictionProfile | null;
  splitConfig?: TrainingSplitConfig | null;
  recentSessionTitles?: string[];
  recentCompletedSplitDays?: Array<{
    dayId?: string | null;
    dayName?: string | null;
  }>;
};

export type BrainMetric = {
  score: number;
  label: string;
};

export type BrainSignalCard = {
  label: string;
  value: string;
  note: string;
};

export type RecommendedExercise = {
  slot: string;
  name: string;
  sets: string;
  reps: string;
  load: string;
  loadBasis: string;
  note: string;
  eventTag?: string;
  swappedFrom?: string | null;
};

export type RecommendedSession = {
  focus: Exclude<BrainFocus, "Mixed">;
  bias: string;
  title: string;
  rationale: string;
  volumeNote: string;
  alerts: string[];
  plannedDayId: string | null;
  plannedDayName: string | null;
  exercises: RecommendedExercise[];
};

export type BrainSnapshot = {
  readiness: BrainMetric;
  momentum: BrainMetric;
  recovery: BrainMetric;
  compliance: BrainMetric;
  systemTake: string;
  nextFocus: string;
  signalCards: BrainSignalCard[];
  nextSessionPriority: NextSessionPriorityProfile;
  recommendedSession: RecommendedSession;
};

type Decision = {
  plannedFocus: Exclude<BrainFocus, "Mixed">;
  focus: Exclude<BrainFocus, "Mixed">;
  plannedDayId: string | null;
  plannedDayName: string | null;
  mode: "Progression" | "Base" | "Reduced volume";
  wasOverride: boolean;
  overrideReason: string | null;
};

type ProgressionMemory = {
  strength: "improving" | "flat" | "declining" | "unknown";
  fatigue: "stable" | "rising" | "unknown";
  stalled: boolean;
};

type SlotProgram = {
  label: string;
  sets: string;
  reps: string;
  bump: number;
  note: string;
};

const DISPLAY_NAME: Record<string, string> = {
  bench_press: "Bench Press",
  incline_bench_press: "Incline Bench Press",
  dumbbell_bench_press: "DB Bench Press",
  chest_press: "Chest Press",
  overhead_press: "Overhead Press",
  shoulder_press: "Shoulder Press",
  dip: "Dip",
  lateral_raise: "Lateral Raise",
  rear_delt_fly: "Rear Delt Fly",
  triceps_pressdown: "Triceps Pressdown",
  overhead_triceps_extension: "Overhead Triceps Extension",
  skullcrusher: "Skullcrusher",
  push_up: "Push-Up",
  pec_deck: "Pec Deck",
  barbell_row: "Barbell Row",
  chest_supported_row: "Chest Supported Row",
  seated_cable_row: "Seated Cable Row",
  t_bar_row: "T-Bar Row",
  one_arm_dumbbell_row: "One-Arm DB Row",
  pull_up: "Pull-Up",
  chin_up: "Chin-Up",
  lat_pulldown: "Lat Pulldown",
  assisted_pull_up: "Assisted Pull-Up",
  face_pull: "Face Pull",
  reverse_pec_deck: "Reverse Pec Deck",
  band_pull_apart: "Band Pull-Apart",
  hammer_curl: "Hammer Curl",
  curl: "Curl",
  incline_dumbbell_curl: "Incline DB Curl",
  preacher_curl: "Preacher Curl",
  ssb_squat: "SSB Squat",
  squat: "Squat",
  romanian_deadlift: "Romanian Deadlift",
  deadlift: "Deadlift",
  good_morning: "Good Morning",
  leg_extension: "Leg Extension",
  split_squat: "Split Squat",
  hamstring_curl: "Hamstring Curl",
  glute_ham_raise: "Glute-Ham Raise",
  seated_leg_curl: "Seated Leg Curl",
  calf_raise: "Standing Calf Raise",
  seated_calf_raise: "Seated Calf Raise",
  leg_press_calf_raise: "Leg Press Calf Raise",
};

const SLOT_PROGRAMS: Record<Slot, SlotProgram> = {
  PrimaryPress: {
    label: "Primary press",
    sets: "4",
    reps: "5-6",
    bump: 5,
    note: "Top movement. Push load if bar speed stays honest.",
  },
  SecondaryPress: {
    label: "Secondary press",
    sets: "3",
    reps: "6-8",
    bump: 2.5,
    note: "Leave one clean rep in reserve.",
  },
  Shoulders: {
    label: "Shoulders",
    sets: "3",
    reps: "8-12",
    bump: 2.5,
    note: "Quality reps over heroics.",
  },
  Triceps: {
    label: "Chest / triceps",
    sets: "3",
    reps: "10-15",
    bump: 0,
    note: "Chase a pump, not a funeral.",
  },
  Pump: {
    label: "Finisher",
    sets: "2-3",
    reps: "12-20",
    bump: 0,
    note: "Easy on joints. Accumulate clean work.",
  },
  PrimaryRow: {
    label: "Primary row",
    sets: "4",
    reps: "6-8",
    bump: 5,
    note: "Drive progression here if recovery is green.",
  },
  VerticalPull: {
    label: "Vertical pull",
    sets: "3",
    reps: "6-10",
    bump: 0,
    note: "Own the squeeze at the top.",
  },
  SecondaryRow: {
    label: "Secondary row",
    sets: "3",
    reps: "8-12",
    bump: 5,
    note: "Controlled eccentric.",
  },
  RearDelts: {
    label: "Rear delt / upper back",
    sets: "3",
    reps: "12-15",
    bump: 0,
    note: "Posture work. Don't rush it.",
  },
  Biceps: {
    label: "Arms",
    sets: "3",
    reps: "10-15",
    bump: 0,
    note: "Finish with blood, not ego.",
  },
  PrimarySquat: {
    label: "Primary squat",
    sets: "4",
    reps: "5-6",
    bump: 5,
    note: "Main driver. Belt up and move clean.",
  },
  Hinge: {
    label: "Hinge",
    sets: "3",
    reps: "6-8",
    bump: 5,
    note: "Keep hamstrings honest without frying the back.",
  },
  SecondaryQuad: {
    label: "Secondary quad",
    sets: "3",
    reps: "10-12",
    bump: 10,
    note: "Hard but smooth.",
  },
  Hamstrings: {
    label: "Hamstrings",
    sets: "3",
    reps: "10-15",
    bump: 5,
    note: "Get the squeeze.",
  },
  Calves: {
    label: "Calves",
    sets: "4",
    reps: "10-15",
    bump: 5,
    note: "Slow stretch, hard lockout.",
  },
};

function normalizeText(value: string | null | undefined): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildDefaultSplitConfig(): TrainingSplitConfig {
  return {
    preset: "ppl",
    days: [
      { id: "push", name: "Push", slots: ["PrimaryPress", "SecondaryPress", "Shoulders", "Triceps", "Pump"] },
      { id: "pull", name: "Pull", slots: ["PrimaryRow", "VerticalPull", "SecondaryRow", "RearDelts", "Biceps"] },
      { id: "lower", name: "Lower", slots: ["PrimarySquat", "Hinge", "SecondaryQuad", "Hamstrings", "Calves"] },
    ],
  };
}

function sanitizeSplitConfig(splitConfig?: TrainingSplitConfig | null): TrainingSplitConfig {
  const fallback = buildDefaultSplitConfig();
  if (!splitConfig?.days?.length) return fallback;
  const days = splitConfig.days
    .map((day, idx) => ({
      id: day.id || `day_${idx + 1}`,
      name: String(day.name || `Day ${idx + 1}`).trim() || `Day ${idx + 1}`,
      slots: (Array.isArray(day.slots) ? day.slots : []).filter(Boolean) as Slot[],
    }))
    .filter((day) => day.slots.length > 0);
  if (!days.length) return fallback;
  return { preset: splitConfig.preset || "custom", days };
}

function inferFocusFromSlots(slots: Slot[]): Exclude<BrainFocus, "Mixed"> {
  const counts: Record<Exclude<BrainFocus, "Mixed">, number> = { Push: 0, Pull: 0, Lower: 0 };
  for (const slot of slots) {
    if (["PrimaryPress", "SecondaryPress", "Shoulders", "Triceps", "Pump"].includes(slot)) counts.Push += 1;
    if (["PrimaryRow", "VerticalPull", "SecondaryRow", "RearDelts", "Biceps"].includes(slot)) counts.Pull += 1;
    if (["PrimarySquat", "Hinge", "SecondaryQuad", "Hamstrings", "Calves"].includes(slot)) counts.Lower += 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (ranked[0]?.[0] as Exclude<BrainFocus, "Mixed">) || "Push";
}

function matchSplitDayName(title: string | null | undefined, split: TrainingSplitConfig): string | null {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return null;
  for (const day of split.days) {
    const normalizedDay = normalizeText(day.name);
    if (normalizedDay && normalizedTitle.includes(normalizedDay)) return day.name;
  }
  return null;
}

function resolveSplitDay(def: { dayId?: string | null; dayName?: string | null } | null | undefined, split: TrainingSplitConfig): SplitDayDefinition | null {
  if (!def) return null;
  if (def.dayId) {
    const byId = split.days.find((day) => day.id === def.dayId);
    if (byId) return byId;
  }
  const normalizedName = normalizeText(def.dayName);
  if (normalizedName) {
    const byName = split.days.find((day) => normalizeText(day.name) === normalizedName);
    if (byName) return byName;
  }
  return null;
}

function summarizeSplitHistory(
  titles: string[] | undefined,
  split: TrainingSplitConfig,
  completedSplitDays?: Array<{ dayId?: string | null; dayName?: string | null }>
): { counts: Record<string, number>; lastDayId: string | null; lastDayName: string | null } {
  const counts: Record<string, number> = Object.fromEntries(split.days.map((day) => [day.name, 0]));
  let lastDayId: string | null = null;
  let lastDayName: string | null = null;

  for (const def of completedSplitDays || []) {
    const resolved = resolveSplitDay(def, split);
    if (!resolved) continue;
    counts[resolved.name] = (counts[resolved.name] || 0) + 1;
    if (!lastDayName) {
      lastDayId = resolved.id;
      lastDayName = resolved.name;
    }
  }

  if (!lastDayName) {
    for (const title of titles || []) {
      const matched = matchSplitDayName(title, split);
      if (!matched) continue;
      counts[matched] = (counts[matched] || 0) + 1;
      if (!lastDayName) {
        const resolved = split.days.find((day) => day.name === matched) || null;
        lastDayId = resolved?.id ?? null;
        lastDayName = matched;
      }
    }
  }

  return { counts, lastDayId, lastDayName };
}

function chooseSplitDay(input: BrainInput, split: TrainingSplitConfig): SplitDayDefinition {
  const history = summarizeSplitHistory(input.recentSessionTitles, split, input.recentCompletedSplitDays);
  const first = split.days[0];
  if (!history.lastDayName) return first;

  const eligibleDays = split.days.filter((day) => day.name !== history.lastDayName);
  if (!eligibleDays.length) return first;

  const currentIdx = history.lastDayId
    ? split.days.findIndex((day) => day.id === history.lastDayId)
    : split.days.findIndex((day) => day.name === history.lastDayName);
  const rotated = currentIdx >= 0 ? split.days[(currentIdx + 1) % split.days.length] : first;

  if (rotated.name !== history.lastDayName) {
    const rotatedEligible = eligibleDays.find((day) => day.id === rotated.id);
    if (rotatedEligible) return rotatedEligible;
  }

  const leastHitEligible = eligibleDays
    .slice()
    .sort((a, b) => (history.counts[a.name] || 0) - (history.counts[b.name] || 0))[0];

  return leastHitEligible || eligibleDays[0] || first;
}

function enrichSplitDay(day: SplitDayDefinition): SplitDayDefinition {
  if (day.slots.length >= 5) return day;
  const focus = inferFocusFromSlots(day.slots);
  const defaults = focus === "Push"
    ? ["PrimaryPress", "SecondaryPress", "Shoulders", "Triceps", "Pump"]
    : focus === "Pull"
    ? ["PrimaryRow", "VerticalPull", "SecondaryRow", "RearDelts", "Biceps"]
    : ["PrimarySquat", "Hinge", "SecondaryQuad", "Hamstrings", "Calves"];
  const slots = [...day.slots];
  for (const slot of defaults) {
    if (slots.length >= 5) break;
    slots.push(slot);
  }
  return { ...day, slots: slots.slice(0, 6) };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function metricLabel(score: number): string {
  if (score >= 85) return "Green light";
  if (score >= 70) return "Usable";
  if (score >= 55) return "Caution";
  return "Needs recovery";
}






function progressionMode(
  readiness: number,
  recovery: number,
  momentum: number,
  friction?: FrictionProfile | null
): "Progression" | "Base" | "Reduced volume" {
  if (friction?.recommendations.progressionCap === "hold" || friction?.recommendations.volumeCap === "reduced") return "Reduced volume";
  if (recovery < 62 || readiness < 65) return "Reduced volume";
  if (friction?.recommendations.progressionCap === "soft") return "Base";
  if (readiness >= 85 && recovery >= 80 && momentum >= 85) return "Progression";
  return "Base";
}

function chooseDecision(
  input: BrainInput,
  readiness: number,
  recovery: number,
  momentum: number,
  adaptiveFocus: Exclude<BrainFocus, "Mixed">,
  plannedFocus: Exclude<BrainFocus, "Mixed">,
  plannedDayId: string | null,
  plannedDayName: string | null
): Decision {
  const baseMode = progressionMode(readiness, recovery, momentum, input.frictionProfile);

  if (recovery < 45) {
    return {
      plannedFocus,
      focus: plannedFocus,
      plannedDayId,
      plannedDayName,
      mode: "Reduced volume",
      wasOverride: false,
      overrideReason:
        "Recovery is low, so the planned split day stays in place but volume and intent are kept light and crisp.",
    };
  }

  if (recovery < 60 && plannedFocus === "Lower") {
    return {
      plannedFocus,
      focus: plannedFocus,
      plannedDayId,
      plannedDayName,
      mode: "Reduced volume",
      wasOverride: false,
      overrideReason:
        "Recovery is soft, so lower day stays on the calendar but shifts to a reduced-volume version instead of being bumped out.",
    };
  }

  return {
    plannedFocus,
    focus: plannedFocus,
    plannedDayId,
    plannedDayName,
    mode: baseMode,
    wasOverride: false,
    overrideReason:
      adaptiveFocus !== plannedFocus
        ? plannedDayName
          ? `The adaptive engine leaned ${adaptiveFocus}, but ${plannedDayName} remains the source of truth for today.`
          : `The adaptive engine leaned ${adaptiveFocus}, but the configured split day remains the source of truth for today.`
        : null,
  };
}

function nearestIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function analyzeProgressionMemory(hist: ExerciseHistory | null): ProgressionMemory {
  const top = hist?.recentTopSetE1RMs ?? [];
  const avg = hist?.recentAvgSetReps ?? [];

  if (top.length < 3 || avg.length < 3) {
    return { strength: "unknown", fatigue: "unknown", stalled: false };
  }

  const [t1, t2, t3] = top.slice(-3);
  const [a1, a2, a3] = avg.slice(-3);
  const priorTop = Math.max(t1, t2);
  const topDelta = priorTop > 0 ? (t3 - priorTop) / priorTop : 0;

  const strength =
    topDelta > 0.015 ? "improving" : topDelta < -0.015 ? "declining" : "flat";

  const fatigue = a3 < a1 - 0.5 || a3 < a2 - 0.5 ? "rising" : "stable";
  const stalled = strength !== "improving" && fatigue === "rising";

  return { strength, fatigue, stalled };
}

function parseRepRange(reps: string): { min: number; max: number; target: number } {
  const cleaned = reps.trim();
  if (cleaned.includes("-")) {
    const [a, b] = cleaned.split("-").map((part) => Number(part.trim()));
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { min: a, max: b, target: (a + b) / 2 };
    }
  }
  const single = Number(cleaned);
  if (Number.isFinite(single)) {
    return { min: single, max: single, target: single };
  }
  return { min: 8, max: 8, target: 8 };
}

function incrementForExercise(name: string, baseLoad: number | null, defaultBump: number): number {
  const lower = name.toLowerCase();
  if (
    lower.includes("lateral raise") ||
    lower.includes("curl") ||
    lower.includes("pressdown") ||
    lower.includes("extension")
  ) {
    return 2.5;
  }
  if (lower.includes("pull-up") || lower.includes("chin-up") || lower.includes("dip")) {
    return defaultBump > 0 ? defaultBump : 5;
  }
  if (baseLoad != null && baseLoad < 80) return 2.5;
  return defaultBump > 0 ? defaultBump : 5;
}

function formatLoadValue(load: number): string {
  return Number.isInteger(load) ? `${Math.round(load)} lb` : `${load.toFixed(1)} lb`;
}

function renderLoad(
  hist: ExerciseHistory | null,
  bump: number,
  mode: "Progression" | "Base" | "Reduced volume",
  reps: string,
  name: string
): { load: string; loadBasis: string } {
  const repRange = parseRepRange(reps);
  const lastLoad = hist?.lastLoad ?? null;
  const lastReps = hist?.lastReps ?? null;
  const daysAgo = hist?.lastPerformedDaysAgo ?? null;

  if (lastLoad != null && Number.isFinite(lastLoad) && lastLoad > 0) {
    const increment = incrementForExercise(name, lastLoad, bump);
    let suggested = lastLoad;
    let basis = `Load path: repeat last logged working load of ${formatLoadValue(lastLoad)}.`;

    if (mode === "Reduced volume") {
      const reduced = Math.max(0, lastLoad - (increment > 2.5 ? increment : 0));
      suggested = reduced > 0 ? reduced : lastLoad;
      basis =
        suggested < lastLoad
          ? `Load path: recovery is soft, so pull ${increment} lb off the last logged ${formatLoadValue(
              lastLoad
            )} and keep reps clean.`
          : `Load path: keep last logged ${formatLoadValue(
              lastLoad
            )} and trim effort or one set if recovery is soft.`;
    } else if (lastReps != null) {
      if (mode === "Progression" && lastReps >= repRange.max && increment > 0) {
        suggested = lastLoad + increment;
        basis = `Load path: last time you hit ${formatLoadValue(
          lastLoad
        )} for ${lastReps}, which clears the ${reps} target. Nudge to ${formatLoadValue(
          suggested
        )}.`;
      } else if (lastReps < repRange.min) {
        suggested = lastLoad;
        basis = `Load path: last time ${formatLoadValue(
          lastLoad
        )} only got ${lastReps}, which is under the ${reps} target. Hold the load and earn the reps.`;
      } else {
        suggested = lastLoad;
        basis = `Load path: last time ${formatLoadValue(
          lastLoad
        )} landed at ${lastReps} reps, which sits inside the ${reps} target. Repeat it and own it.`;
      }
    }

    if (daysAgo != null && daysAgo >= 21) {
      basis += ` It has been ${daysAgo} days since you touched this lift, so treat the first work set as a calibration set.`;
    }

    return {
      load: formatLoadValue(suggested),
      loadBasis: basis,
    };
  }

  const recentBestE1RM = hist?.recentBestE1RM ?? null;
  if (recentBestE1RM != null && Number.isFinite(recentBestE1RM) && recentBestE1RM > 0) {
    const estimate = recentBestE1RM / (1 + repRange.target / 30);
    const increment = incrementForExercise(name, estimate, bump);
    const rounded = nearestIncrement(estimate, increment >= 5 ? 5 : 2.5);
    return {
      load: formatLoadValue(rounded),
      loadBasis: `Load path: estimated from recent best e1RM of ${Math.round(
        recentBestE1RM
      )} for a ${reps} target, then rounded to a usable jump.`,
    };
  }

  if (name.includes("Pull-Up") || name.includes("Chin-Up") || name === "Dip") {
    return {
      load: "Bodyweight / last good load",
      loadBasis:
        "Load path: no stable external load history yet, so use bodyweight or the last clean loading you know is real.",
    };
  }

  return {
    load: "Use last good working weight",
    loadBasis:
      "Load path: no reliable history yet, so pick the heaviest crisp load that lands in the prescribed rep range.",
  };
}

function classifyNeedForExercise(key: string): NeedKey {
  if (
    key === "bench_press" ||
    key === "incline_bench_press" ||
    key === "dumbbell_bench_press" ||
    key === "chest_press" ||
    key === "dip" ||
    key === "push_up" ||
    key === "pec_deck"
  ) {
    return "horizontalPress";
  }
  if (key === "overhead_press" || key === "shoulder_press") {
    return "verticalPress";
  }
  if (
    key === "barbell_row" ||
    key === "chest_supported_row" ||
    key === "seated_cable_row" ||
    key === "t_bar_row" ||
    key === "one_arm_dumbbell_row"
  ) {
    return "row";
  }
  if (
    key === "pull_up" ||
    key === "chin_up" ||
    key === "lat_pulldown" ||
    key === "assisted_pull_up"
  ) {
    return "verticalPull";
  }
  if (
    key === "ssb_squat" ||
    key === "squat" ||
    key === "leg_press" ||
    key === "hack_squat" ||
    key === "leg_extension" ||
    key === "split_squat"
  ) {
    return "quadDominant";
  }
  if (
    key === "romanian_deadlift" ||
    key === "deadlift" ||
    key === "good_morning" ||
    key === "hamstring_curl" ||
    key === "glute_ham_raise" ||
    key === "seated_leg_curl"
  ) {
    return "hinge";
  }
  if (
    key === "hammer_curl" ||
    key === "curl" ||
    key === "incline_dumbbell_curl" ||
    key === "preacher_curl"
  ) {
    return "biceps";
  }
  if (
    key === "triceps_pressdown" ||
    key === "overhead_triceps_extension" ||
    key === "skullcrusher"
  ) {
    return "triceps";
  }
  if (
    key === "lateral_raise" ||
    key === "rear_delt_fly" ||
    key === "face_pull" ||
    key === "reverse_pec_deck" ||
    key === "band_pull_apart"
  ) {
    return "delts";
  }
  if (
    key === "calf_raise" ||
    key === "seated_calf_raise" ||
    key === "leg_press_calf_raise"
  ) {
    return "calves";
  }
  return "horizontalPress";
}

function buildMovementSignals(history: ExerciseHistory[]): NeedEngineInput["movementSignals"] {
  const buckets = new Map<
    NeedKey,
    {
      recentSessions: number;
      stalled: boolean;
      progressing: boolean;
      avgFatigueRising: boolean;
      daysSinceHit: number | null;
    }
  >();

  for (const hist of history) {
    const need = classifyNeedForExercise(hist.key);
    const memory = analyzeProgressionMemory(hist);
    const existing = buckets.get(need);

    if (!existing) {
      buckets.set(need, {
        recentSessions: 1,
        stalled: memory.stalled,
        progressing: memory.strength === "improving",
        avgFatigueRising: memory.fatigue === "rising",
        daysSinceHit: hist.lastPerformedDaysAgo ?? null,
      });
    } else {
      existing.recentSessions += 1;
      existing.stalled = existing.stalled || memory.stalled;
      existing.progressing = existing.progressing || memory.strength === "improving";
      existing.avgFatigueRising = existing.avgFatigueRising || memory.fatigue === "rising";
      existing.daysSinceHit =
        existing.daysSinceHit == null
          ? hist.lastPerformedDaysAgo ?? null
          : hist.lastPerformedDaysAgo == null
          ? existing.daysSinceHit
          : Math.min(existing.daysSinceHit, hist.lastPerformedDaysAgo);
    }
  }

  return Object.fromEntries(buckets.entries());
}

function buildExercisesFromSlots(
  slots: Slot[],
  mode: "Progression" | "Base" | "Reduced volume",
  history: ExerciseHistory[],
  preferenceSignals?: PreferenceSignals | null,
  frictionProfile?: FrictionProfile | null,
  priorityProfile?: NextSessionPriorityProfile | null
): RecommendedExercise[] {
  const used = new Set<string>();
  const selectedKeys: string[] = [];
  const noveltyCap = frictionProfile?.recommendations.noveltyCap ?? "normal";
  const volumeCap = frictionProfile?.recommendations.volumeCap ?? "normal";
  const anchorDemand = frictionProfile?.recommendations.anchorDemand ?? "normal";
  const trimmedSlots = volumeCap === "reduced"
    ? slots.filter((slot) => !["Pump", "Calves"].includes(slot)).slice(0, Math.max(3, slots.length - 1))
    : volumeCap === "soft"
    ? slots.filter((slot, idx) => !(slot === "Pump" && idx >= 4))
    : slots;

  const topPriority = priorityProfile?.topPriorities?.[0] ?? null;
  const secondPriority = priorityProfile?.topPriorities?.[1] ?? null;
  const slotSupportsBalance = (slot: Slot) => ["PrimaryRow", "VerticalPull", "RearDelts", "Biceps", "Hamstrings", "Calves", "SecondaryQuad", "Shoulders"].includes(slot);
  const slotIsAnchor = (slot: Slot) => ["PrimaryPress", "PrimaryRow", "VerticalPull", "PrimarySquat", "Hinge"].includes(slot);
  const slotIsSupport = (slot: Slot) => ["SecondaryPress", "SecondaryRow", "Shoulders", "Triceps", "Pump", "RearDelts", "Biceps", "SecondaryQuad", "Hamstrings", "Calves"].includes(slot);

  return trimmedSlots.flatMap((slot) => {
    const program = SLOT_PROGRAMS[slot];
    const candidates = broadenCandidatesForCoveredSlot(slot, candidatesForSlot(slot), selectedKeys);
    const rankedBase = candidates
      .map((key) => scoreCandidateForSlot(slot, key, history, mode, preferenceSignals));
    const ranked = rankedBase
      .filter((candidate) => !candidate.tags.includes("Never"))
      .map((candidate) => {
        let score = candidate.score;
        const tags = [...candidate.tags];
        const histForCandidate = history.find((h) => h.key === candidate.key) ?? null;
        const familiarity = !!histForCandidate;
        const isFresh = candidate.tags.includes("Fresh");
        const isAnchorSlot = ["PrimaryPress", "PrimaryRow", "PrimarySquat", "Hinge", "VerticalPull"].includes(slot);

        if (topPriority?.category === "anchor_progression" && isAnchorSlot && familiarity && candidate.tags.includes("Progression path")) {
          score += 10;
          tags.push("Priority: anchor progression");
        }
        if ((topPriority?.category === "movement_balance" || secondPriority?.category === "movement_balance") && slotSupportsBalance(slot)) {
          score += 6;
          tags.push("Priority: balance correction");
        }
        if ((topPriority?.category === "pattern_repeat" || secondPriority?.category === "pattern_repeat") && familiarity) {
          score += 6;
          tags.push("Priority: pattern repeat");
        }
        if ((topPriority?.category === "volume_reinforcement" || secondPriority?.category === "volume_reinforcement") && slotIsSupport(slot)) {
          score += 4;
          tags.push("Priority: volume reinforcement");
        }
        if ((topPriority?.category === "fatigue_containment" || secondPriority?.category === "fatigue_containment") && (isFresh || !familiarity)) {
          score -= 8;
          tags.push("Priority: fatigue containment");
        }
        if ((topPriority?.category === "continuity_recovery" || secondPriority?.category === "continuity_recovery") && familiarity) {
          score += 7;
          tags.push("Priority: continuity recovery");
        }

        if (noveltyCap === "minimal" && isFresh && !familiarity) {
          score -= 12;
          tags.push("Friction: novelty cap");
        } else if (noveltyCap === "reduced" && isFresh) {
          score -= 6;
          tags.push("Friction: novelty trim");
        }

        if ((anchorDemand === "protect" || anchorDemand === "preserve") && isAnchorSlot && familiarity) {
          score += anchorDemand === "preserve" ? 10 : 6;
          tags.push(anchorDemand === "preserve" ? "Friction: preserve anchor" : "Friction: protect anchor");
        }

        if (volumeCap === "reduced" && ["Shoulders", "Triceps", "Biceps", "RearDelts", "Pump", "Calves"].includes(slot)) {
          score -= 4;
          tags.push("Friction: trim fluff");
        }

        const overlapPenalty = applyMovementOverlapPenalty(slot, candidate.key, selectedKeys);
        if (overlapPenalty !== 0) {
          score += overlapPenalty;
          tags.push("Overlap guard");
        }

        return { ...candidate, score, tags: [...new Set(tags)] };
      })
      .sort((a, b) => b.score - a.score);

    let chosen = ranked.find((candidate) => !used.has(candidate.key)) ?? ranked[0] ?? null;
    const primaryKey = ranked[0]?.key ?? rankedBase.find((candidate) => !candidate.tags.includes("Never"))?.key ?? null;
    const primaryHist = primaryKey ? (history.find((h) => h.key === primaryKey) ?? null) : null;

    if (!chosen) {
      chosen = rankedBase.find((candidate) => !candidate.tags.includes("Never") && !used.has(candidate.key))
        ?? rankedBase.find((candidate) => !candidate.tags.includes("Never"))
        ?? null;
    }

    const key = chosen?.key ?? primaryKey;
    if (!key) return [];
    used.add(key);
    selectedKeys.push(key);

    const activeHist = history.find((h) => h.key === key) ?? null;
    const activeMemory = analyzeProgressionMemory(activeHist);
    const name = activeHist?.name ?? DISPLAY_NAME[key] ?? key;
    const sets =
      mode === "Reduced volume" && (slot === "Pump" || slot === "Calves")
        ? "2"
        : program.sets;
    const loadInfo = renderLoad(activeHist, program.bump, mode, program.reps, name);

    let note = activeHist?.lastReps
      ? `Last time ${Math.round(activeHist.lastLoad ?? 0)} x ${activeHist.lastReps}. ${program.note}`
      : program.note;

    let eventTag: string | undefined;
    let swappedFrom: string | null = null;

    const primaryMemory = analyzeProgressionMemory(primaryHist);
    const forcedSwap =
      !!(primaryHist && activeHist && primaryHist.key !== activeHist.key && primaryMemory.stalled);
    const scoredRotation =
      !!(primaryHist && activeHist && primaryHist.key !== activeHist.key && !primaryMemory.stalled);

    if (forcedSwap && primaryHist && activeHist) {
      loadInfo.loadBasis = `Load path: ${primaryHist.name} looks stalled across the last few outings, so the brain is rotating to ${activeHist.name} from your own logged exercise pool.`;
      note = `Variation swap: ${primaryHist.name} looks flat while average working reps are sliding. ${activeHist.name} gets the nod for this block.`;
      eventTag = "Variation swap";
      swappedFrom = primaryHist.name;
    } else if (scoredRotation && primaryHist && activeHist) {
      loadInfo.loadBasis = `Load path: slot scoring gave ${activeHist.name} the edge today — enough familiarity to be useful, enough freshness to keep things moving.`;
      note = `${activeHist.name} wins this slot on a 70/30 familiarity-to-freshness score, instead of just repeating ${primaryHist.name} again.`;
      eventTag = "Rotation pick";
      swappedFrom = primaryHist.name;
    } else if (
      activeMemory.strength === "improving" &&
      activeMemory.fatigue === "stable" &&
      activeHist?.lastReps
    ) {
      note = `${note} Progression memory says strength is moving and fatigue is behaving.`;
      eventTag = mode === "Progression" ? "Progression push" : "Trend green";
      if (frictionProfile?.recommendations.progressionCap === "soft") note = `${note} Friction keeps progression on a short leash even though the trend looks decent.`;
    } else if (activeMemory.strength === "flat" && activeMemory.fatigue === "rising") {
      note = `${note} Progression memory says hold your water — fatigue is climbing faster than performance.`;
      eventTag = "Hold load";
    } else if (mode === "Reduced volume") {
      if (frictionProfile?.recommendations.volumeCap === "reduced") note = `${note} Friction profile is trimming session demand to preserve completion.`;
      eventTag = chosen?.tags.includes("Recovery-friendly")
        ? "Recovery-friendly"
        : chosen?.tags.includes("Preference lean")
        ? "Preference lean"
        : "Reduced volume";
    } else if (chosen?.tags.includes("Familiar") && !chosen.tags.includes("Fresh")) {
      eventTag = "Mainstay";
    } else if (chosen?.tags.includes("Preference lean")) {
      eventTag = "Preference lean";
    } else if (chosen?.tags.includes("Fresh")) {
      eventTag = "Rotation pick";
    }

    if (chosen && chosen.tags.length > 0 && !forcedSwap && !scoredRotation) {
      const cleaned = chosen.tags
        .map((tag) => {
          if (tag === "Familiar") return "Chosen for familiarity";
          if (tag === "Fresh") return "Chosen for rotation";
          if (tag === "Recovery-friendly") return "Chosen for recovery";
          if (tag === "Progression path") return "Chosen for progression";
          if (tag === "Preference lean") return "Chosen for preference fit";
          if (tag === "Stall penalty") return "Penalty applied for stalling";
          if (tag === "Priority: anchor progression") return "Priority engine pushed anchor progression";
          if (tag === "Priority: balance correction") return "Priority engine boosted balance work";
          if (tag === "Priority: pattern repeat") return "Priority engine favored pattern repeat";
          if (tag === "Priority: volume reinforcement") return "Priority engine favored more useful work";
          if (tag === "Priority: fatigue containment") return "Priority engine trimmed risk for fatigue containment";
          if (tag === "Priority: continuity recovery") return "Priority engine favored continuity recovery";
          return tag;
        })
        .join(", ");
      note = `${note} ${cleaned}.`;
    }

    const chosenFamily = getMovementFamilyForExerciseKey(key);
    const displaySlot =
      slot === "SecondaryRow" && chosenFamily !== "horizontal_pull"
        ? "Upper back / rear delt"
        : slot === "SecondaryPress" && chosenFamily === "triceps"
        ? "Press support / triceps"
        : slot === "SecondaryPress" && chosenFamily === "vertical_push"
        ? "Shoulders / press support"
        : slot === "SecondaryQuad" && chosenFamily !== "squat"
        ? "Lower support"
        : program.label;

    return [{
      slot: displaySlot,
      name,
      sets,
      reps: program.reps,
      load: loadInfo.load,
      loadBasis: loadInfo.loadBasis,
      note,
      eventTag,
      swappedFrom,
    }];
  });
}

export function computeBrainSnapshot(input: BrainInput): BrainSnapshot {
  const sleepAvg = input.sleepAvg7 ?? 0;
  const proteinAvg = input.proteinAvg7 ?? 0;
  const wc = input.weeklyCoach;

  const cadence7 = wc?.sessionsThis ?? 0;
  const cadence28 = input.trainingDays28 / 4;
  const cadenceScore =
    cadence7 > 0 ? Math.min(100, cadence7 * 18) : Math.min(100, cadence28 * 22);
  const sleepScore = sleepAvg > 0 ? clamp(35 + sleepAvg * 9, 35, 100) : 60;
  const proteinScore = proteinAvg > 0 ? clamp(30 + proteinAvg * 0.3, 35, 100) : 60;

  const tonnageDelta = wc
    ? wc.tonnagePrev > 0
      ? ((wc.tonnageThis - wc.tonnagePrev) / wc.tonnagePrev) * 100
      : wc.tonnageThis > 0
      ? 20
      : 0
    : 0;

  const setDelta = wc
    ? wc.setsPrev > 0
      ? ((wc.setsThis - wc.setsPrev) / wc.setsPrev) * 100
      : wc.setsThis > 0
      ? 20
      : 0
    : 0;

  const momentumScore = clamp(
    55 + tonnageDelta * 0.8 + setDelta * 0.5 + Math.min(cadence7, 5) * 3,
    25,
    98
  );
  const recoveryScore = clamp(
    sleepScore * 0.55 +
      proteinScore * 0.2 +
      (100 - Math.max(0, cadence7 - 4) * 10) * 0.25,
    25,
    98
  );
  const readinessScore = clamp(
    sleepScore * 0.35 + proteinScore * 0.25 + momentumScore * 0.2 + recoveryScore * 0.2,
    25,
    99
  );
  const complianceScore = clamp(
    cadenceScore * 0.7 + proteinScore * 0.2 + sleepScore * 0.1,
    25,
    99
  );

  const movementSignals = buildMovementSignals(input.exerciseHistory);
  const needSnapshot = computeNeedSnapshot({
    recentFocusCounts: input.recentFocusCounts,
    recoveryScore,
    readinessScore,
    momentumScore,
    complianceScore,
    trainingDays28: input.trainingDays28,
    weeklyCoach: input.weeklyCoach,
    movementSignals,
  });

  const needWeightProfile = deriveNeedWeightProfile({
    recentFocusCounts: input.recentFocusCounts,
    exerciseHistory: input.exerciseHistory.map((h) => ({
      key: h.key,
      recentSets: h.recentSets,
      lastPerformedDaysAgo: h.lastPerformedDaysAgo,
    })),
  });

  const weightedNeeds = applyNeedWeightProfile(needSnapshot, needWeightProfile);

  const preferenceWeightedNeeds = applyPreferenceSignalsToNeeds(weightedNeeds, input.preferenceSignals);

  const movementDebt = computeMovementDebtSnapshot({
    exerciseHistory: input.exerciseHistory.map((h) => ({
      key: h.key,
      recentSets: h.recentSets,
      lastPerformedDaysAgo: h.lastPerformedDaysAgo,
    })),
  });

  const debtWeightedNeeds = applyMovementDebtToNeeds(preferenceWeightedNeeds, movementDebt);

  const split = sanitizeSplitConfig(input.splitConfig);
  const chosenSplitDay = enrichSplitDay(chooseSplitDay(input, split));

  const composer = composeAdaptiveSession({
    needs: debtWeightedNeeds,
    explicitDay: {
      name: chosenSplitDay.name,
      slots: chosenSplitDay.slots,
    },
    preferredPairings: {
      row: [...new Set(["triceps", "verticalPull", "biceps", ...((input.preferenceSignals?.preferredPairings?.row) ?? [])])],
      horizontalPress: [...new Set(["biceps", "triceps", "delts", ...((input.preferenceSignals?.preferredPairings?.horizontalPress) ?? [])])],
      quadDominant: [...new Set(["calves", "hinge", ...((input.preferenceSignals?.preferredPairings?.quadDominant) ?? [])])],
      hinge: [...new Set(["calves", "quadDominant", ...((input.preferenceSignals?.preferredPairings?.hinge) ?? [])])],
      verticalPress: [...new Set([ ...((input.preferenceSignals?.preferredPairings?.verticalPress) ?? [])])],
      verticalPull: [...new Set([ ...((input.preferenceSignals?.preferredPairings?.verticalPull) ?? [])])],
    },
    blockedPairings:
      debtWeightedNeeds.recoveryBias === "red"
        ? [["quadDominant", "hinge"]]
        : [],
  });

  const adaptiveFocus = inferFocusFromSlots(composer.slots);
  const decision = chooseDecision(
    input,
    readinessScore,
    recoveryScore,
    momentumScore,
    adaptiveFocus,
    inferFocusFromSlots(chosenSplitDay.slots),
    chosenSplitDay.id,
    chosenSplitDay.name
  );

  const nextSessionPriority = buildNextSessionPriorityProfile({
    asOf: new Date().toISOString(),
    focus: decision.focus,
    mode: decision.mode,
    topNeeds: composer.topNeeds,
    recoveryBias: composer.recoveryBias,
    frictionProfile: input.frictionProfile,
    weeklyCoach: input.weeklyCoach,
    exerciseHistory: input.exerciseHistory,
  });

  const recommendedExercises = buildExercisesFromSlots(
    composer.slots,
    decision.mode,
    input.exerciseHistory,
    input.preferenceSignals,
    input.frictionProfile,
    nextSessionPriority
  );

  const friction = input.frictionProfile;

  const systemTake = friction?.level === "high"
    ? `System sees real friction in the week, so today is built to preserve continuity before chasing ideals.`
    : decision.wasOverride
    ? `System called an audible — ${decision.overrideReason ?? "the adaptive composer saw a better place to put work today."}`
    : decision.mode === "Progression"
    ? "System says go — enough signal and enough recovery to nudge progression without getting stupid."
    : decision.mode === "Reduced volume"
    ? "System says train, but keep your head on straight — enough fatigue is hanging around that today should be crisp, not heroic."
    : "System says steady as she goes — productive base work beats forcing the issue.";

  const signalCards: BrainSignalCard[] = [
    {
      label: "Sleep",
      value: sleepAvg > 0 ? `${sleepAvg.toFixed(1)} h` : "—",
      note:
        sleepAvg >= 6.5
          ? "Enough runway to train hard."
          : sleepAvg >= 5.5
          ? "Serviceable, not plush."
          : "Thin sleep. Earn your volume.",
    },
    {
      label: "Protein",
      value: proteinAvg > 0 ? `${Math.round(proteinAvg)} g` : "—",
      note:
        proteinAvg >= 180
          ? "Muscle retention box checked."
          : proteinAvg >= 140
          ? "Close, but tighten it up."
          : "Protein is leaving gains on the table.",
    },
    {
      label: "Training Cadence",
      value: `${cadence7}/7 days`,
      note:
        cadence7 >= 4
          ? "Plenty of signal for progression."
          : cadence7 >= 2
          ? "Some signal, but more rhythm would help."
          : "You need more logged work to steer hard.",
    },
    {
      label: "Momentum",
      value: String(momentumScore),
      note:
        momentumScore >= 80
          ? "Trendline is moving the right way."
          : momentumScore >= 65
          ? "Stable, but not surging."
          : "Momentum is soft. Rebuild consistency first.",
    },
  ];

  const topNeedsText = composer.topNeeds
    .slice(0, 3)
    .map((need) => debtWeightedNeeds.scores[need]?.key ?? need)
    .join(", ");

  const rationaleParts = [
    composer.reasons[0] ?? `${composer.emphasis} won the session build today.`,
    composer.reasons[1] ?? "The slot bundle was built from the highest current needs.",
  ];

  const topWeightedNeed = composer.topNeeds[0];
  if (topWeightedNeed && (needWeightProfile.weights[topWeightedNeed] ?? 1) > 1.04) {
    rationaleParts.push(
      `Need weighting also boosted ${topWeightedNeed} to reflect what this physique currently seems to need most.`
    );
  }

  const topDebtNeed = movementDebt.ranked[0];
  if (topDebtNeed && topDebtNeed.debtScore >= 12) {
    rationaleParts.push(
      `Movement debt is also building in ${topDebtNeed.key}, so the composer is less willing to let that lane keep drifting.`
    );
  }

  if (decision.wasOverride && decision.overrideReason) {
    rationaleParts.unshift(decision.overrideReason);
  }

  const rationale = rationaleParts.join(" ");

  const volumeNote =
    friction?.recommendations.volumeCap === "reduced"
      ? "Friction is high, so trim accessories, keep the session short, and leave more in reserve than your ego wants."
      : decision.mode === "Reduced volume"
      ? "Trim one accessory set where needed and leave one more rep in reserve than usual."
      : decision.mode === "Progression"
      ? "Take the first anchor movement seriously, then keep the rest crisp and businesslike."
      : "Run the planned work, keep execution clean, and let consistency do the lifting.";

  const alerts: string[] = [];
  alerts.push(`Split day: ${decision.plannedDayName ?? composer.emphasis}`);
  if (composer.topNeeds.length > 0) {
    alerts.push(`Top needs: ${composer.topNeeds.slice(0, 3).join(" / ")}`);
  }
  const weightedBoosts = composer.topNeeds
    .map((need) => ({ need, weight: needWeightProfile.weights[need] ?? 1 }))
    .filter((item) => item.weight > 1.04)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2);
  for (const item of weightedBoosts) {
    alerts.push(`Need weighting favors ${item.need} (${item.weight.toFixed(2)}x)`);
  }

  const topDebtLanes = movementDebt.ranked
    .filter((lane) => lane.debtScore >= 12)
    .slice(0, 2);
  for (const lane of topDebtLanes) {
    alerts.push(`Movement debt rising: ${lane.key} (+${lane.debtScore})`);
  }
  if (decision.wasOverride) {
    alerts.push(`Opinionated call: ${decision.plannedFocus} delayed, ${decision.focus} gets the nod`);
  }
  if (friction) {
    alerts.push(`Friction ${friction.level}: progression ${friction.recommendations.progressionCap} / volume ${friction.recommendations.volumeCap} / novelty ${friction.recommendations.noveltyCap}`);
  }
  if (decision.mode === "Progression") {
    alerts.push("Progression window open");
  } else if (decision.mode === "Reduced volume") {
    alerts.push("Recovery protection mode");
  }
  if (input.preferenceSignals?.reasons?.length) {
    for (const reason of input.preferenceSignals.reasons.slice(0, 2)) {
      alerts.push(`Preference learning: ${reason}`);
    }
  }

  const swappedExercises = recommendedExercises.filter((ex) => ex.swappedFrom);
  if (swappedExercises.length > 0) {
    for (const ex of swappedExercises.slice(0, 2)) {
      alerts.push(`Variation swap: ${ex.swappedFrom} → ${ex.name}`);
    }
    if (swappedExercises.length > 2) {
      alerts.push(`+${swappedExercises.length - 2} more swap${swappedExercises.length - 2 === 1 ? "" : "s"}`);
    }
  }

  return {
    readiness: { score: readinessScore, label: metricLabel(readinessScore) },
    momentum: { score: momentumScore, label: metricLabel(momentumScore) },
    recovery: { score: recoveryScore, label: metricLabel(recoveryScore) },
    compliance: { score: complianceScore, label: metricLabel(complianceScore) },
    systemTake,
    nextFocus: `${decision.plannedDayName ?? composer.emphasis} — ${decision.mode}`,
    signalCards,
    nextSessionPriority,
    recommendedSession: {
      focus: decision.focus,
      bias: decision.mode,
      title: `${decision.plannedDayName ?? composer.emphasis} Session`,
      rationale,
      volumeNote,
      alerts,
      plannedDayId: decision.plannedDayId,
      plannedDayName: decision.plannedDayName,
      exercises: recommendedExercises,
    },
  };
}









































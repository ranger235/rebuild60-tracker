import { DEFAULT_SEQUENCE } from "./sessionSequence";
import { allSlotsForFocus, type Slot } from "./slotEngine";

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
  recommendedSession: RecommendedSession;
};

type Decision = {
  plannedFocus: Exclude<BrainFocus, "Mixed">;
  focus: Exclude<BrainFocus, "Mixed">;
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
  leg_press: "Leg Press",
  hack_squat: "Hack Squat",
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
  leg_press_calf_raise: "Leg Press Calf Raise"
};

const SLOT_PROGRAMS: Record<Slot, SlotProgram> = {
  PrimaryPress: {
    label: "Primary press",
    sets: "4",
    reps: "5-6",
    bump: 5,
    note: "Top movement. Push load if bar speed stays honest."
  },
  SecondaryPress: {
    label: "Secondary press",
    sets: "3",
    reps: "6-8",
    bump: 2.5,
    note: "Leave one clean rep in reserve."
  },
  Shoulders: {
    label: "Shoulders",
    sets: "3",
    reps: "8-12",
    bump: 2.5,
    note: "Quality reps over heroics."
  },
  Triceps: {
    label: "Chest / triceps",
    sets: "3",
    reps: "10-15",
    bump: 0,
    note: "Chase a pump, not a funeral."
  },
  Pump: {
    label: "Finisher",
    sets: "2-3",
    reps: "12-20",
    bump: 0,
    note: "Easy on joints. Accumulate clean work."
  },
  PrimaryRow: {
    label: "Primary row",
    sets: "4",
    reps: "6-8",
    bump: 5,
    note: "Drive progression here if recovery is green."
  },
  VerticalPull: {
    label: "Vertical pull",
    sets: "3",
    reps: "6-10",
    bump: 0,
    note: "Own the squeeze at the top."
  },
  SecondaryRow: {
    label: "Secondary row",
    sets: "3",
    reps: "8-12",
    bump: 5,
    note: "Controlled eccentric."
  },
  RearDelts: {
    label: "Rear delt / upper back",
    sets: "3",
    reps: "12-15",
    bump: 0,
    note: "Posture work. Don't rush it."
  },
  Biceps: {
    label: "Arms",
    sets: "3",
    reps: "10-15",
    bump: 0,
    note: "Finish with blood, not ego."
  },
  PrimarySquat: {
    label: "Primary squat",
    sets: "4",
    reps: "5-6",
    bump: 5,
    note: "Main driver. Belt up and move clean."
  },
  Hinge: {
    label: "Hinge",
    sets: "3",
    reps: "6-8",
    bump: 5,
    note: "Keep hamstrings honest without frying the back."
  },
  SecondaryQuad: {
    label: "Secondary quad",
    sets: "3",
    reps: "10-12",
    bump: 10,
    note: "Hard but smooth."
  },
  Hamstrings: {
    label: "Hamstrings",
    sets: "3",
    reps: "10-15",
    bump: 5,
    note: "Get the squeeze."
  },
  Calves: {
    label: "Calves",
    sets: "4",
    reps: "10-15",
    bump: 5,
    note: "Slow stretch, hard lockout."
  }
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function metricLabel(score: number): string {
  if (score >= 85) return "Green light";
  if (score >= 70) return "Usable";
  if (score >= 55) return "Caution";
  return "Needs recovery";
}

function findHistory(history: ExerciseHistory[], candidates: string[]): ExerciseHistory | null {
  const byKey = new Map(history.map((h) => [h.key, h]));
  for (const key of candidates) {
    const hit = byKey.get(key);
    if (hit) return hit;
  }
  return null;
}

function inferUnderrepresentedFocus(counts: FocusCounts): Exclude<BrainFocus, "Mixed"> {
  const entries: Array<[Exclude<BrainFocus, "Mixed">, number]> = [
    ["Push", counts.Push],
    ["Pull", counts.Pull],
    ["Lower", counts.Lower]
  ];
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}

function nextFocusFromSplit(
  lastFocus: BrainFocus | null,
  sequence: string[]
): Exclude<BrainFocus, "Mixed"> {
  if (!sequence || sequence.length === 0) return "Push";
  if (!lastFocus) return sequence[0] as Exclude<BrainFocus, "Mixed">;

  const idx = sequence.indexOf(lastFocus);
  if (idx === -1) return sequence[0] as Exclude<BrainFocus, "Mixed">;

  return sequence[(idx + 1) % sequence.length] as Exclude<BrainFocus, "Mixed">;
}

function choosePlannedFocus(input: BrainInput): Exclude<BrainFocus, "Mixed"> {
  const rotated = nextFocusFromSplit(input.lastSessionFocus, DEFAULT_SEQUENCE);
  const underHit = inferUnderrepresentedFocus(input.recentFocusCounts);
  const gap = input.recentFocusCounts[rotated] - input.recentFocusCounts[underHit];

  if (gap >= 2) return underHit;
  return rotated;
}

function fallbackOverrideFocus(plannedFocus: Exclude<BrainFocus, "Mixed">): Exclude<BrainFocus, "Mixed"> {
  if (plannedFocus === "Lower") return "Push";
  if (plannedFocus === "Push") return "Pull";
  return "Push";
}

function progressionMode(readiness: number, recovery: number, momentum: number): "Progression" | "Base" | "Reduced volume" {
  if (recovery < 62 || readiness < 65) return "Reduced volume";
  if (readiness >= 85 && recovery >= 80 && momentum >= 85) return "Progression";
  return "Base";
}

function chooseDecision(
  input: BrainInput,
  readiness: number,
  recovery: number,
  momentum: number
): Decision {
  const plannedFocus = choosePlannedFocus(input);
  const baseMode = progressionMode(readiness, recovery, momentum);

  if (recovery < 45) {
    const focus = fallbackOverrideFocus(plannedFocus);
    return {
      plannedFocus,
      focus,
      mode: "Reduced volume",
      wasOverride: focus !== plannedFocus,
      overrideReason:
        focus !== plannedFocus
          ? `Recovery is low, so ${plannedFocus} is delayed — not skipped — and ${focus} gets the nod for today.`
          : "Recovery is low, so today stays light and crisp."
    };
  }

  if (recovery < 60 && plannedFocus === "Lower") {
    return {
      plannedFocus,
      focus: "Push",
      mode: "Reduced volume",
      wasOverride: true,
      overrideReason: "Recovery is soft, so heavy lower work is delayed until next time. Today shifts to a lighter push session."
    };
  }

  return {
    plannedFocus,
    focus: plannedFocus,
    mode: baseMode,
    wasOverride: false,
    overrideReason: null
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
    topDelta > 0.015 ? "improving" :
    topDelta < -0.015 ? "declining" :
    "flat";

  const fatigue = a3 < a1 - 0.5 || a3 < a2 - 0.5 ? "rising" : "stable";
  const stalled = strength !== "improving" && fatigue === "rising";

  return { strength, fatigue, stalled };
}

function chooseSiblingVariation(
  hist: ExerciseHistory | null,
  history: ExerciseHistory[],
  candidates: string[]
): ExerciseHistory | null {
  if (!hist) return null;

  const options = history
    .filter((h) => h.key !== hist.key && candidates.includes(h.key))
    .sort((a, b) => {
      const aRecent = a.lastPerformedDaysAgo ?? 9999;
      const bRecent = b.lastPerformedDaysAgo ?? 9999;
      if (aRecent !== bRecent) return aRecent - bRecent;
      return (b.recentSets ?? 0) - (a.recentSets ?? 0);
    });

  return options[0] ?? null;
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
  if (lower.includes("lateral raise") || lower.includes("curl") || lower.includes("pressdown") || lower.includes("extension")) {
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
      basis = suggested < lastLoad
        ? `Load path: recovery is soft, so pull ${increment} lb off the last logged ${formatLoadValue(lastLoad)} and keep reps clean.`
        : `Load path: keep last logged ${formatLoadValue(lastLoad)} and trim effort or one set if recovery is soft.`;
    } else if (lastReps != null) {
      if (mode === "Progression" && lastReps >= repRange.max && increment > 0) {
        suggested = lastLoad + increment;
        basis = `Load path: last time you hit ${formatLoadValue(lastLoad)} for ${lastReps}, which clears the ${reps} target. Nudge to ${formatLoadValue(suggested)}.`;
      } else if (lastReps < repRange.min) {
        suggested = lastLoad;
        basis = `Load path: last time ${formatLoadValue(lastLoad)} only got ${lastReps}, which is under the ${reps} target. Hold the load and earn the reps.`;
      } else {
        suggested = lastLoad;
        basis = `Load path: last time ${formatLoadValue(lastLoad)} landed at ${lastReps} reps, which sits inside the ${reps} target. Repeat it and own it.`;
      }
    }

    if (daysAgo != null && daysAgo >= 21) {
      basis += ` It has been ${daysAgo} days since you touched this lift, so treat the first work set as a calibration set.`;
    }

    return {
      load: formatLoadValue(suggested),
      loadBasis: basis
    };
  }

  const recentBestE1RM = hist?.recentBestE1RM ?? null;
  if (recentBestE1RM != null && Number.isFinite(recentBestE1RM) && recentBestE1RM > 0) {
    const estimate = recentBestE1RM / (1 + repRange.target / 30);
    const increment = incrementForExercise(name, estimate, bump);
    const rounded = nearestIncrement(estimate, increment >= 5 ? 5 : 2.5);
    return {
      load: formatLoadValue(rounded),
      loadBasis: `Load path: estimated from recent best e1RM of ${Math.round(recentBestE1RM)} for a ${reps} target, then rounded to a usable jump.`
    };
  }

  if (name.includes("Pull-Up") || name.includes("Chin-Up") || name === "Dip") {
    return {
      load: "Bodyweight / last good load",
      loadBasis: "Load path: no stable external load history yet, so use bodyweight or the last clean loading you know is real."
    };
  }

  return {
    load: "Use last good working weight",
    loadBasis: "Load path: no reliable history yet, so pick the heaviest crisp load that lands in the prescribed rep range."
  };
}

function buildExercises(
  focus: Exclude<BrainFocus, "Mixed">,
  mode: "Progression" | "Base" | "Reduced volume",
  history: ExerciseHistory[]
): RecommendedExercise[] {
  const slotDefs = allSlotsForFocus(focus);

  return slotDefs.map(({ slot, candidates }) => {
    const program = SLOT_PROGRAMS[slot];
    const primaryHist = findHistory(history, candidates);
    const memory = analyzeProgressionMemory(primaryHist);
    const swapHist = memory.stalled ? chooseSiblingVariation(primaryHist, history, candidates) : null;
    const activeHist = swapHist ?? primaryHist;
    const key = activeHist?.key ?? candidates[0];
    const name = activeHist?.name ?? DISPLAY_NAME[key] ?? key;
    const sets = mode === "Reduced volume" && (slot === "Pump" || slot === "Calves") ? "2" : program.sets;
    const loadInfo = renderLoad(activeHist, program.bump, mode, program.reps, name);

    let note = activeHist?.lastReps
      ? `Last time ${Math.round(activeHist.lastLoad ?? 0)} x ${activeHist.lastReps}. ${program.note}`
      : program.note;

    let eventTag: string | undefined;
    let swappedFrom: string | null = null;

    if (swapHist && primaryHist) {
      loadInfo.loadBasis = `Load path: ${primaryHist.name} looks stalled across the last few outings, so the brain is rotating to ${swapHist.name} from your own logged exercise pool.`;
      note = `Variation swap: ${primaryHist.name} looks flat while average working reps are sliding. ${swapHist.name} gets the nod for this block.`;
      eventTag = "Variation swap";
      swappedFrom = primaryHist.name;
    } else if (memory.strength === "improving" && memory.fatigue === "stable" && activeHist?.lastReps) {
      note = `${note} Progression memory says strength is moving and fatigue is behaving.`;
      eventTag = mode === "Progression" ? "Progression push" : "Trend green";
    } else if (memory.strength === "flat" && memory.fatigue === "rising") {
      note = `${note} Progression memory says hold your water — fatigue is climbing faster than performance.`;
      eventTag = "Hold steady";
    } else if (mode === "Reduced volume") {
      eventTag = "Reduced volume";
    }

    return {
      slot: program.label,
      name,
      sets,
      reps: program.reps,
      load: loadInfo.load,
      loadBasis: loadInfo.loadBasis,
      note,
      eventTag,
      swappedFrom
    };
  });
}

export function computeBrainSnapshot(input: BrainInput): BrainSnapshot {
  const sleepAvg = input.sleepAvg7 ?? 0;
  const proteinAvg = input.proteinAvg7 ?? 0;
  const wc = input.weeklyCoach;

  const cadence7 = wc?.sessionsThis ?? 0;
  const cadence28 = input.trainingDays28 / 4;
  const cadenceScore = cadence7 > 0 ? Math.min(100, cadence7 * 18) : Math.min(100, cadence28 * 22);
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

  const momentumScore = clamp(55 + tonnageDelta * 0.8 + setDelta * 0.5 + Math.min(cadence7, 5) * 3, 25, 98);
  const recoveryScore = clamp(sleepScore * 0.55 + proteinScore * 0.2 + (100 - Math.max(0, cadence7 - 4) * 10) * 0.25, 25, 98);
  const readinessScore = clamp(sleepScore * 0.35 + proteinScore * 0.25 + momentumScore * 0.2 + recoveryScore * 0.2, 25, 99);
  const complianceScore = clamp(cadenceScore * 0.7 + proteinScore * 0.2 + sleepScore * 0.1, 25, 99);

  const decision = chooseDecision(input, readinessScore, recoveryScore, momentumScore);
  const recommendedExercises = buildExercises(decision.focus, decision.mode, input.exerciseHistory);

  const systemTake =
    decision.wasOverride
      ? `System called an audible — ${decision.overrideReason ?? "recovery is low enough to delay the planned session."}`
      : decision.mode === "Progression"
        ? "System says go — enough signal and enough recovery to nudge progression without getting stupid."
        : decision.mode === "Reduced volume"
          ? "System says train, but keep your head on straight — enough fatigue is hanging around that today should be crisp, not heroic."
          : "System says steady as she goes — productive base work beats forcing the issue.";

  const signalCards: BrainSignalCard[] = [
    {
      label: "Sleep",
      value: sleepAvg > 0 ? `${sleepAvg.toFixed(1)} h` : "—",
      note: sleepAvg >= 6.5 ? "Enough runway to train hard." : sleepAvg >= 5.5 ? "Serviceable, not plush." : "Thin sleep. Earn your volume."
    },
    {
      label: "Protein",
      value: proteinAvg > 0 ? `${Math.round(proteinAvg)} g` : "—",
      note: proteinAvg >= 180 ? "Muscle retention box checked." : proteinAvg >= 140 ? "Close, but tighten it up." : "Protein is leaving gains on the table."
    },
    {
      label: "Training Cadence",
      value: `${cadence7}/7 days`,
      note: cadence7 >= 4 ? "Plenty of signal for progression." : cadence7 >= 2 ? "Some signal, but more rhythm would help." : "You need more logged work to steer hard."
    },
    {
      label: "Momentum",
      value: String(momentumScore),
      note: momentumScore >= 80 ? "Trendline is moving the right way." : momentumScore >= 65 ? "Stable, but not surging." : "Momentum is soft. Rebuild consistency first."
    }
  ];

  const rationale =
    decision.wasOverride
      ? `${decision.overrideReason} The planned ${decision.plannedFocus} session remains next in line after today.`
      : decision.focus === "Push"
        ? "Pressing is next in the split and current recovery is good enough to make it worth showing up with intent."
        : decision.focus === "Pull"
          ? "Pulling gets the nod — it follows the split cleanly and balances recent work without burying recovery."
          : "Lower gets the nod — either it is next in line or it needs catching up, so we put work where work is owed.";

  const volumeNote =
    decision.mode === "Reduced volume"
      ? "Trim one accessory set where needed and leave one more rep in reserve than usual."
      : decision.mode === "Progression"
        ? "Take the first compound seriously, then keep the rest crisp and businesslike."
        : "Run the planned work, keep execution clean, and let consistency do the lifting.";

  const alerts: string[] = [];
  if (decision.wasOverride) {
    alerts.push(`Sequence override: ${decision.plannedFocus} delayed, ${decision.focus} runs today`);
  } else {
    alerts.push(`Sequence on track: ${decision.focus} is still next in line`);
  }
  if (decision.mode === "Progression") {
    alerts.push("Progression window open");
  } else if (decision.mode === "Reduced volume") {
    alerts.push("Recovery protection mode");
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
    nextFocus: `${decision.focus} — ${decision.mode}${decision.wasOverride ? " (override)" : ""}`,
    signalCards,
    recommendedSession: {
      focus: decision.focus,
      bias: decision.mode,
      title: `${decision.focus} Day`,
      rationale,
      volumeNote,
      alerts,
      exercises: recommendedExercises
    }
  };
}








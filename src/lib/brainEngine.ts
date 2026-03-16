import { DEFAULT_SEQUENCE } from "./sessionSequence";

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
};

export type RecommendedSession = {
  focus: Exclude<BrainFocus, "Mixed">;
  bias: string;
  title: string;
  rationale: string;
  volumeNote: string;
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

type TemplateSlot = {
  slot: string;
  candidates: string[];
  sets: string;
  reps: string;
  bump: number;
  note: string;
};

const DISPLAY_NAME: Record<string, string> = {
  bench_press: "Bench Press",
  incline_bench_press: "Incline Bench Press",
  dumbbell_bench_press: "DB Bench Press",
  overhead_press: "Overhead Press",
  dip: "Dip",
  lateral_raise: "Lateral Raise",
  triceps_pressdown: "Triceps Pressdown",
  overhead_triceps_extension: "Overhead Triceps Extension",
  barbell_row: "Barbell Row",
  chest_supported_row: "Chest Supported Row",
  seated_cable_row: "Seated Cable Row",
  pull_up: "Pull-Up",
  chin_up: "Chin-Up",
  lat_pulldown: "Lat Pulldown",
  face_pull: "Face Pull",
  hammer_curl: "Hammer Curl",
  curl: "Curl",
  ssb_squat: "SSB Squat",
  squat: "Squat",
  leg_press: "Leg Press",
  hack_squat: "Hack Squat",
  romanian_deadlift: "Romanian Deadlift",
  deadlift: "Deadlift",
  leg_extension: "Leg Extension",
  hamstring_curl: "Hamstring Curl",
  calf_raise: "Standing Calf Raise"
};

const PUSH_TEMPLATE: TemplateSlot[] = [
  { slot: "Primary press", candidates: ["bench_press", "incline_bench_press", "dumbbell_bench_press"], sets: "4", reps: "5-6", bump: 5, note: "Top movement. Push load if bar speed stays honest." },
  { slot: "Secondary press", candidates: ["incline_bench_press", "overhead_press", "dumbbell_bench_press"], sets: "3", reps: "6-8", bump: 2.5, note: "Leave one clean rep in reserve." },
  { slot: "Shoulders", candidates: ["overhead_press", "lateral_raise"], sets: "3", reps: "8-12", bump: 2.5, note: "Quality reps over heroics." },
  { slot: "Chest / triceps", candidates: ["dip", "triceps_pressdown", "overhead_triceps_extension"], sets: "3", reps: "10-15", bump: 0, note: "Chase a pump, not a funeral." },
  { slot: "Finisher", candidates: ["lateral_raise", "triceps_pressdown", "overhead_triceps_extension"], sets: "2-3", reps: "12-20", bump: 0, note: "Easy on joints. Accumulate clean work." }
];

const PULL_TEMPLATE: TemplateSlot[] = [
  { slot: "Primary row", candidates: ["barbell_row", "chest_supported_row", "seated_cable_row"], sets: "4", reps: "6-8", bump: 5, note: "Drive progression here if recovery is green." },
  { slot: "Vertical pull", candidates: ["pull_up", "chin_up", "lat_pulldown"], sets: "3", reps: "6-10", bump: 0, note: "Own the squeeze at the top." },
  { slot: "Secondary row", candidates: ["chest_supported_row", "seated_cable_row", "barbell_row"], sets: "3", reps: "8-12", bump: 5, note: "Controlled eccentric." },
  { slot: "Rear delt / upper back", candidates: ["face_pull", "lat_pulldown"], sets: "3", reps: "12-15", bump: 0, note: "Posture work. Don't rush it." },
  { slot: "Arms", candidates: ["hammer_curl", "curl"], sets: "3", reps: "10-15", bump: 0, note: "Finish with blood, not ego." }
];

const LOWER_TEMPLATE: TemplateSlot[] = [
  { slot: "Primary squat", candidates: ["ssb_squat", "squat", "leg_press", "hack_squat"], sets: "4", reps: "5-6", bump: 5, note: "Main driver. Belt up and move clean." },
  { slot: "Hinge", candidates: ["romanian_deadlift", "deadlift", "hamstring_curl"], sets: "3", reps: "6-8", bump: 5, note: "Keep hamstrings honest without frying the back." },
  { slot: "Secondary quad", candidates: ["leg_press", "hack_squat", "leg_extension"], sets: "3", reps: "10-12", bump: 10, note: "Hard but smooth." },
  { slot: "Hamstrings", candidates: ["hamstring_curl", "romanian_deadlift"], sets: "3", reps: "10-15", bump: 5, note: "Get the squeeze." },
  { slot: "Calves", candidates: ["calf_raise"], sets: "4", reps: "10-15", bump: 5, note: "Slow stretch, hard lockout." }
];

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

function chooseFocus(input: BrainInput, recoveryScore: number): Exclude<BrainFocus, "Mixed"> {
  const rotated = nextFocusFromSplit(input.lastSessionFocus, DEFAULT_SEQUENCE);
  const underHit = inferUnderrepresentedFocus(input.recentFocusCounts);
  const gap = input.recentFocusCounts[rotated] - input.recentFocusCounts[underHit];

  if (recoveryScore < 60 && rotated === "Lower") return "Push";
  if (gap >= 2) return underHit;
  return rotated;
}

function progressionMode(readiness: number, recovery: number, momentum: number): "Progression" | "Base" | "Reduced volume" {
  if (recovery < 62 || readiness < 65) return "Reduced volume";
  if (readiness >= 80 && recovery >= 70 && momentum >= 75) return "Progression";
  return "Base";
}

function nearestIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
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
  const template = focus === "Push" ? PUSH_TEMPLATE : focus === "Pull" ? PULL_TEMPLATE : LOWER_TEMPLATE;
  return template.map((slot) => {
    const hist = findHistory(history, slot.candidates);
    const key = hist?.key ?? slot.candidates[0];
    const name = hist?.name ?? DISPLAY_NAME[key] ?? key;
    const sets = mode === "Reduced volume" && (slot.slot === "Finisher" || slot.slot === "Calves") ? "2" : slot.sets;
    const loadInfo = renderLoad(hist, slot.bump, mode, slot.reps, name);
    return {
      slot: slot.slot,
      name,
      sets,
      reps: slot.reps,
      load: loadInfo.load,
      loadBasis: loadInfo.loadBasis,
      note: hist?.lastReps ? `Last time ${Math.round(hist.lastLoad ?? 0)} x ${hist.lastReps}. ${slot.note}` : slot.note
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

  const focus = chooseFocus(input, recoveryScore);
  const mode = progressionMode(readinessScore, recoveryScore, momentumScore);
  const recommendedExercises = buildExercises(focus, mode, input.exerciseHistory);

  const systemTake =
    mode === "Progression"
      ? "System says go — enough signal and enough recovery to nudge progression without getting stupid."
      : mode === "Reduced volume"
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

  return {
    readiness: { score: readinessScore, label: metricLabel(readinessScore) },
    momentum: { score: momentumScore, label: metricLabel(momentumScore) },
    recovery: { score: recoveryScore, label: metricLabel(recoveryScore) },
    compliance: { score: complianceScore, label: metricLabel(complianceScore) },
    systemTake,
    nextFocus: `${focus} — ${mode}`,
    signalCards,
    recommendedSession: {
      focus,
      bias: mode,
      title: `${focus} Day`,
      rationale:
        focus === "Push"
          ? "Pressing is next in the split and current recovery is good enough to make it worth showing up with intent."
          : focus === "Pull"
            ? "Pulling gets the nod — it follows the split cleanly and balances recent work without burying recovery."
            : "Lower gets the nod — either it is next in line or it needs catching up, so we put work where work is owed.",
      volumeNote:
        mode === "Reduced volume"
          ? "Trim one accessory set where needed and leave one more rep in reserve than usual."
          : mode === "Progression"
            ? "Take the first compound seriously, then keep the rest crisp and businesslike."
            : "Run the planned work, keep execution clean, and let consistency do the lifting.",
      exercises: recommendedExercises
    }
  };
}




import type { NeedKey, NeedSnapshot, NeedScore } from "./sessionNeedsEngine";

export type NeedWeightProfile = {
  name: string;
  weights: Record<NeedKey, number>;
  reasons: Partial<Record<NeedKey, string[]>>;
};

export type NeedWeightInput = {
  recentFocusCounts: {
    Push: number;
    Pull: number;
    Lower: number;
    Mixed: number;
  };
  exerciseHistory: Array<{
    key: string;
    recentSets: number;
    lastPerformedDaysAgo: number | null;
  }>;
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

function clampWeight(n: number): number {
  return Math.max(0.75, Math.min(1.35, Number(n.toFixed(2))));
}

function emptyReasons(): Partial<Record<NeedKey, string[]>> {
  return {};
}

function classifyNeed(key: string): NeedKey {
  if (
    key === "bench_press" ||
    key === "incline_bench_press" ||
    key === "dumbbell_bench_press" ||
    key === "chest_press" ||
    key === "dip" ||
    key === "push_up" ||
    key === "pec_deck"
  ) return "horizontalPress";

  if (key === "overhead_press" || key === "shoulder_press") return "verticalPress";

  if (
    key === "barbell_row" ||
    key === "chest_supported_row" ||
    key === "seated_cable_row" ||
    key === "t_bar_row" ||
    key === "one_arm_dumbbell_row"
  ) return "row";

  if (
    key === "pull_up" ||
    key === "chin_up" ||
    key === "lat_pulldown" ||
    key === "assisted_pull_up"
  ) return "verticalPull";

  if (
    key === "ssb_squat" ||
    key === "squat" ||
    key === "leg_press" ||
    key === "hack_squat" ||
    key === "leg_extension" ||
    key === "split_squat"
  ) return "quadDominant";

  if (
    key === "romanian_deadlift" ||
    key === "deadlift" ||
    key === "good_morning" ||
    key === "hamstring_curl" ||
    key === "glute_ham_raise" ||
    key === "seated_leg_curl"
  ) return "hinge";

  if (
    key === "hammer_curl" ||
    key === "curl" ||
    key === "incline_dumbbell_curl" ||
    key === "preacher_curl"
  ) return "biceps";

  if (
    key === "triceps_pressdown" ||
    key === "overhead_triceps_extension" ||
    key === "skullcrusher"
  ) return "triceps";

  if (
    key === "lateral_raise" ||
    key === "rear_delt_fly" ||
    key === "face_pull" ||
    key === "reverse_pec_deck" ||
    key === "band_pull_apart"
  ) return "delts";

  if (
    key === "calf_raise" ||
    key === "seated_calf_raise" ||
    key === "leg_press_calf_raise"
  ) return "calves";

  return "horizontalPress";
}

function addReason(
  reasons: Partial<Record<NeedKey, string[]>>,
  key: NeedKey,
  text: string
) {
  if (!reasons[key]) reasons[key] = [];
  reasons[key]!.push(text);
}

export function deriveNeedWeightProfile(input: NeedWeightInput): NeedWeightProfile {
  const weights = Object.fromEntries(
    NEED_KEYS.map((key) => [key, 1])
  ) as Record<NeedKey, number>;
  const reasons = emptyReasons();

  const push = input.recentFocusCounts.Push ?? 0;
  const pull = input.recentFocusCounts.Pull ?? 0;
  const lower = input.recentFocusCounts.Lower ?? 0;

  if (lower <= 3) {
    weights.quadDominant += 0.18;
    weights.hinge += 0.14;
    weights.calves += 0.08;
    addReason(reasons, "quadDominant", "Lower work has been relatively sparse, so quads get extra priority.");
    addReason(reasons, "hinge", "Lower work has been relatively sparse, so hinge work gets extra priority.");
    addReason(reasons, "calves", "Lower work has been relatively sparse, so calves get a small extra push.");
  } else if (lower >= 7) {
    weights.quadDominant -= 0.08;
    weights.hinge -= 0.06;
    addReason(reasons, "quadDominant", "Lower work has been plentiful lately, so quads get dialed back a touch.");
    addReason(reasons, "hinge", "Lower work has been plentiful lately, so hinge work gets dialed back a touch.");
  }

  if (pull <= 4) {
    weights.row += 0.14;
    weights.verticalPull += 0.12;
    weights.biceps += 0.08;
    addReason(reasons, "row", "Pull work looks underfed, so rows get a stronger weighting.");
    addReason(reasons, "verticalPull", "Pull work looks underfed, so vertical pulling gets a stronger weighting.");
    addReason(reasons, "biceps", "Pull work looks underfed, so biceps ride along with a small bonus.");
  } else if (pull >= 8) {
    weights.row -= 0.08;
    weights.verticalPull -= 0.08;
    addReason(reasons, "row", "Pull work has been hit hard lately, so row emphasis gets trimmed a little.");
    addReason(reasons, "verticalPull", "Pull work has been hit hard lately, so vertical pulling gets trimmed a little.");
  }

  if (push <= 4) {
    weights.horizontalPress += 0.12;
    weights.verticalPress += 0.08;
    weights.triceps += 0.06;
    weights.delts += 0.06;
    addReason(reasons, "horizontalPress", "Pressing looks light lately, so horizontal pressing gets a boost.");
    addReason(reasons, "verticalPress", "Pressing looks light lately, so vertical pressing gets a boost.");
  } else if (push >= 8) {
    weights.horizontalPress -= 0.08;
    weights.verticalPress -= 0.06;
    weights.triceps -= 0.04;
    weights.delts -= 0.04;
    addReason(reasons, "horizontalPress", "Pressing has been frequent lately, so horizontal pressing gets dialed down a touch.");
    addReason(reasons, "verticalPress", "Pressing has been frequent lately, so vertical pressing gets dialed down a touch.");
  }

  const setTotals = new Map<NeedKey, number>();
  const staleCounts = new Map<NeedKey, number>();
  for (const ex of input.exerciseHistory) {
    const need = classifyNeed(ex.key);
    setTotals.set(need, (setTotals.get(need) ?? 0) + Math.max(0, ex.recentSets ?? 0));
    if ((ex.lastPerformedDaysAgo ?? 999) >= 12) {
      staleCounts.set(need, (staleCounts.get(need) ?? 0) + 1);
    }
  }

  for (const key of NEED_KEYS) {
    const sets = setTotals.get(key) ?? 0;
    const stale = staleCounts.get(key) ?? 0;

    if (sets >= 18) {
      weights[key] += 0.05;
      addReason(reasons, key, "You have real history in this lane, so the engine gives it a small confidence bump.");
    }

    if (stale >= 2) {
      weights[key] += 0.06;
      addReason(reasons, key, "Multiple familiar movements in this lane have gone stale, so the engine raises the need weighting.");
    }
  }

  for (const key of NEED_KEYS) {
    weights[key] = clampWeight(weights[key]);
  }

  return {
    name: "Adaptive physique weighting",
    weights,
    reasons,
  };
}

export function applyNeedWeightProfile(
  snapshot: NeedSnapshot,
  profile: NeedWeightProfile
): NeedSnapshot {
  const scores = {} as Record<NeedKey, NeedScore>;

  for (const key of NEED_KEYS) {
    const base = snapshot.scores[key];
    const weight = profile.weights[key] ?? 1;
    const weightedScore = Math.max(0, Math.min(100, Math.round(base.score * weight)));
    const reasons = [
      ...base.reasons,
      ...(profile.reasons[key] ?? []).map((r) => `Need weighting: ${r}`),
      weight > 1
        ? `Need weighting multiplier ${weight.toFixed(2)} boosted this lane.`
        : weight < 1
        ? `Need weighting multiplier ${weight.toFixed(2)} softened this lane.`
        : `Need weighting multiplier ${weight.toFixed(2)} left this lane neutral.`,
    ];

    scores[key] = {
      key,
      score: weightedScore,
      reasons,
    };
  }

  const ranked = Object.values(scores).sort((a, b) => b.score - a.score);

  return {
    scores,
    ranked,
    recoveryBias: snapshot.recoveryBias,
  };
}

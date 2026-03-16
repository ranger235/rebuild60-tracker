import type { NeedKey, NeedSnapshot, NeedScore } from "./sessionNeedsEngine";

export type MovementDebtLane = {
  key: NeedKey;
  daysSinceHit: number | null;
  recentSetVolume: number;
  debtScore: number;
  reasons: string[];
};

export type MovementDebtSnapshot = {
  lanes: Record<NeedKey, MovementDebtLane>;
  ranked: MovementDebtLane[];
};

export type MovementDebtInput = {
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function computeMovementDebtSnapshot(input: MovementDebtInput): MovementDebtSnapshot {
  const accum = new Map<NeedKey, { recentSetVolume: number; daysSinceHit: number | null }>();

  for (const key of NEED_KEYS) {
    accum.set(key, { recentSetVolume: 0, daysSinceHit: null });
  }

  for (const ex of input.exerciseHistory) {
    const need = classifyNeed(ex.key);
    const current = accum.get(need)!;
    current.recentSetVolume += Math.max(0, ex.recentSets ?? 0);

    if (typeof ex.lastPerformedDaysAgo === "number") {
      current.daysSinceHit =
        current.daysSinceHit == null
          ? ex.lastPerformedDaysAgo
          : Math.min(current.daysSinceHit, ex.lastPerformedDaysAgo);
    }
  }

  const lanes = {} as Record<NeedKey, MovementDebtLane>;

  for (const key of NEED_KEYS) {
    const row = accum.get(key)!;
    const days = row.daysSinceHit;
    const volume = row.recentSetVolume;
    const reasons: string[] = [];

    let debt = 0;

    if (days == null) {
      debt += 18;
      reasons.push("This lane has little or no recent evidence, so debt starts elevated.");
    } else if (days >= 14) {
      debt += 20;
      reasons.push(`It has been ${days} days since this lane got real work, so debt rises sharply.`);
    } else if (days >= 10) {
      debt += 14;
      reasons.push(`It has been ${days} days since this lane got real work, so debt is building.`);
    } else if (days >= 7) {
      debt += 8;
      reasons.push(`It has been ${days} days since this lane got real work, so debt gets a moderate bump.`);
    } else if (days <= 3) {
      debt -= 6;
      reasons.push("This lane was hit very recently, so debt stays low.");
    }

    if (volume <= 4) {
      debt += 12;
      reasons.push("Recent set volume is thin here, so debt gets a volume bonus.");
    } else if (volume <= 8) {
      debt += 6;
      reasons.push("Recent set volume is modest here, so debt gets a small volume bonus.");
    } else if (volume >= 18) {
      debt -= 8;
      reasons.push("Recent set volume has been substantial here, so debt softens.");
    }

    lanes[key] = {
      key,
      daysSinceHit: days,
      recentSetVolume: volume,
      debtScore: clamp(debt, 0, 40),
      reasons,
    };
  }

  const ranked = Object.values(lanes).sort((a, b) => b.debtScore - a.debtScore);

  return { lanes, ranked };
}

export function applyMovementDebtToNeeds(
  snapshot: NeedSnapshot,
  debt: MovementDebtSnapshot
): NeedSnapshot {
  const scores = {} as Record<NeedKey, NeedScore>;

  for (const key of NEED_KEYS) {
    const base = snapshot.scores[key];
    const laneDebt = debt.lanes[key];
    const adjusted = Math.max(0, Math.min(100, Math.round(base.score + laneDebt.debtScore)));
    const reasons = [
      ...base.reasons,
      ...laneDebt.reasons.map((r) => `Movement debt: ${r}`),
      `Movement debt contribution: +${laneDebt.debtScore}.`,
    ];

    scores[key] = {
      key,
      score: adjusted,
      reasons,
    };
  }

  return {
    scores,
    ranked: Object.values(scores).sort((a, b) => b.score - a.score),
    recoveryBias: snapshot.recoveryBias,
  };
}

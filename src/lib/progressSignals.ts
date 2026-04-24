import type {
  LocalDailyMetrics,
  LocalNutritionDaily,
  LocalWorkoutExercise,
  LocalWorkoutSession,
  LocalWorkoutSet,
  LocalZone2Daily,
} from "../localdb";

export type ProgressSignals = {
  monthKey: string;
  startYMD: string;
  endYMD: string;
  daysInRange: number;

  quicklogDays: number;
  measurementDays: number;
  anchorDays: number;
  anchorCompleteness: number;

  weightDelta: number | null;
  waistDelta: number | null;
  avgSleep: number | null;
  avgProtein: number | null;
  avgZone2Minutes: number | null;

  workoutsCompleted: number;
  expectedWorkouts: number;
  uniqueTrainingDays: number;
  totalExercises: number;
  totalSets: number;
  hardSets: number;
  compoundSetShare: number | null;

  upperSetShare: number | null;
  lowerSetShare: number | null;
  pushSetShare: number | null;
  pullSetShare: number | null;
  pushPullBalance: number | null;

  adherenceScore: number | null;
  progressionHits: number | null;
  progressionOpportunities: number | null;
  momentumSignal: number | null;
  visionSupport: number | null;

  hasEnoughData: boolean;
};

type MeasurementLike = {
  taken_on?: string;
  weight_lbs?: number | null;
  waist_in?: number | null;
};

type PhotoLike = {
  taken_on?: string;
  pose?: string | null;
  is_anchor?: boolean | null;
};

const LOWER_GROUPS = new Set([
  "glutes",
  "quads",
  "quadriceps",
  "hamstrings",
  "calves",
  "adductors",
  "abductors",
  "legs",
  "leg",
  "lower body",
  "lower",
]);

const PUSH_MOVEMENTS = new Set(["press", "push", "dip", "extension", "fly", "raise"]);
const PULL_MOVEMENTS = new Set(["row", "pull", "chin", "curl", "face pull", "pulldown", "shrug"]);

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function round1(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}

function sum(vals: Array<number | null | undefined>): number {
  return vals.reduce((acc, v) => acc + (Number.isFinite(Number(v)) ? Number(v) : 0), 0);
}

function avg(vals: Array<number | null | undefined>): number | null {
  const nums = vals.filter((v) => Number.isFinite(Number(v))).map((v) => Number(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function rowDate(value: any): string {
  return String(value?.day_date ?? value?.taken_on ?? value?.started_at ?? "");
}

function sortByDate<T>(arr: T[]): T[] {
  return [...arr].sort((a: any, b: any) => rowDate(a).localeCompare(rowDate(b)));
}

function firstLastDelta<T>(arr: T[], pick: (item: T) => number | null | undefined): number | null {
  const nums = sortByDate(arr)
    .map(pick)
    .filter((v) => Number.isFinite(Number(v)))
    .map((v) => Number(v));
  if (nums.length < 2) return null;
  return nums[nums.length - 1] - nums[0];
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function setEstimatedLoad(set: LocalWorkoutSet): number | null {
  if (set.load_type === "band" && Number.isFinite(Number(set.band_est_lbs))) return Number(set.band_est_lbs);
  if (set.load_type === "bodyweight") return Number.isFinite(Number(set.band_est_lbs)) ? Number(set.band_est_lbs) : null;
  return Number.isFinite(Number(set.weight_lbs)) ? Number(set.weight_lbs) : null;
}

function epley(load: number, reps: number): number {
  return load * (1 + reps / 30);
}

function isLowerExercise(exercise: LocalWorkoutExercise): boolean {
  const movement = normalizeText(exercise.movement);
  const name = normalizeText(exercise.name);
  const groups = Array.isArray(exercise.muscle_groups) ? exercise.muscle_groups.map(normalizeText) : [];
  if (groups.some((g) => LOWER_GROUPS.has(g))) return true;
  if (movement.includes("squat") || movement.includes("hinge") || movement.includes("lunge") || movement.includes("leg") || movement.includes("calf")) return true;
  return /(squat|deadlift|rdl|lunge|split squat|leg press|leg extension|hamstring|curl|calf)/.test(name);
}

function isPushExercise(exercise: LocalWorkoutExercise): boolean {
  const movement = normalizeText(exercise.movement);
  const name = normalizeText(exercise.name);
  if ([...PUSH_MOVEMENTS].some((m) => movement.includes(m))) return true;
  return /(press|dip|push ?up|fly|raise|extension)/.test(name);
}

function isPullExercise(exercise: LocalWorkoutExercise): boolean {
  const movement = normalizeText(exercise.movement);
  const name = normalizeText(exercise.name);
  if ([...PULL_MOVEMENTS].some((m) => movement.includes(m))) return true;
  return /(row|pull|chin|curl|pulldown|face pull|shrug)/.test(name);
}

function parseVisionSupport(visionText?: string | null): number | null {
  const txt = normalizeText(visionText);
  if (!txt) return null;
  let score = 0;
  if (/(improv|better|leaner|fuller|wider|denser|tighter|sharper|more)/.test(txt)) score += 0.6;
  if (/(slight|subtle|modest)/.test(txt)) score += 0.15;
  if (/(clear|obvious|notable|visible)/.test(txt)) score += 0.25;
  if (/(flat|same|unchanged|no major change)/.test(txt)) score -= 0.35;
  if (/(regress|softer|worse|less)/.test(txt)) score -= 0.6;
  return round1(clamp01((score + 1) / 2));
}

export function buildProgressSignals(args: {
  monthKey: string;
  startYMD: string;
  endYMD: string;
  monthDaily: LocalDailyMetrics[];
  monthNutrition: LocalNutritionDaily[];
  monthZone2: LocalZone2Daily[];
  monthMeasurements: MeasurementLike[];
  monthPhotos: PhotoLike[];
  monthSessions: LocalWorkoutSession[];
  monthExercises: LocalWorkoutExercise[];
  monthSets: LocalWorkoutSet[];
  visionText?: string | null;
}): ProgressSignals {
  const {
    monthKey,
    startYMD,
    endYMD,
    monthDaily,
    monthNutrition,
    monthZone2,
    monthMeasurements,
    monthPhotos,
    monthSessions,
    monthExercises,
    monthSets,
    visionText,
  } = args;

  const daysInRange = Math.max(1, Math.round((Date.parse(`${endYMD}T00:00:00Z`) - Date.parse(`${startYMD}T00:00:00Z`)) / 86400000) + 1);
  const expectedWorkouts = Math.max(8, Math.round((daysInRange * 4) / 7));

  // Progress/scorecard signals should reflect only analytics-eligible sessions.
  // Excluded/test sessions can still exist locally and sync normally, but they must not
  // leak into hard set counts, volume balance, progression hits, or monthly adherence.
  const analyticSessions = sortByDate(monthSessions).filter((s) => s.exclude_from_analytics !== true);
  const sessionIds = new Set(analyticSessions.map((s) => s.id));
  const exercises = monthExercises.filter((ex) => sessionIds.has(ex.session_id));
  const exerciseIds = new Set(exercises.map((ex) => ex.id));
  const sets = monthSets.filter((s) => exerciseIds.has(s.exercise_id));
  const hardSets = sets.filter((s) => !s.is_warmup && (Number(s.reps ?? 0) > 0 || Number(setEstimatedLoad(s) ?? 0) > 0));
  const exerciseById = new Map(exercises.map((ex) => [ex.id, ex]));

  let compoundHardSets = 0;
  let lowerSets = 0;
  let upperSets = 0;
  let pushSets = 0;
  let pullSets = 0;

  for (const set of hardSets) {
    const ex = exerciseById.get(set.exercise_id);
    if (!ex) continue;
    if (ex.is_compound) compoundHardSets += 1;
    const lower = isLowerExercise(ex);
    if (lower) lowerSets += 1;
    else upperSets += 1;
    if (isPushExercise(ex)) pushSets += 1;
    if (isPullExercise(ex)) pullSets += 1;
  }

  const performanceByExercise = new Map<string, { first: number; last: number; touches: number }>();
  const setsByExerciseName = new Map<string, Array<{ day: string; e1: number }>>();
  const sessionById = new Map(analyticSessions.map((s) => [s.id, s]));
  for (const set of hardSets) {
    const ex = exerciseById.get(set.exercise_id);
    if (!ex) continue;
    const session = sessionById.get(ex.session_id);
    if (!session) continue;
    const load = setEstimatedLoad(set);
    const reps = Number(set.reps ?? 0);
    if (!Number.isFinite(load) || !Number.isFinite(reps) || load == null || load <= 0 || reps <= 0) continue;
    const name = normalizeText(ex.name);
    const e1 = epley(load, reps);
    const arr = setsByExerciseName.get(name) ?? [];
    arr.push({ day: session.day_date, e1 });
    setsByExerciseName.set(name, arr);
  }

  let progressionHits = 0;
  let progressionOpportunities = 0;
  for (const [name, perfSets] of setsByExerciseName.entries()) {
    if (!name || perfSets.length < 2) continue;
    const bestByDay = new Map<string, number>();
    for (const row of perfSets) {
      const prev = bestByDay.get(row.day);
      if (prev == null || row.e1 > prev) bestByDay.set(row.day, row.e1);
    }
    const ordered = [...bestByDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (ordered.length < 2) continue;
    const first = ordered[0][1];
    const last = ordered[ordered.length - 1][1];
    progressionOpportunities += 1;
    if (last >= first * 1.02) progressionHits += 1;
    performanceByExercise.set(name, { first, last, touches: ordered.length });
  }

  const anchorPhotos = monthPhotos.filter((p) => !!p.is_anchor);
  const anchorDays = new Set(anchorPhotos.map((p) => String(p.taken_on ?? ""))).size;
  const monthPoses = new Set(anchorPhotos.map((p) => normalizeText(p.pose)).filter(Boolean));
  const anchorCompleteness = round1(Math.min(1, monthPoses.size / 3));

  const weightDelta = firstLastDelta(monthDaily, (r) => r.weight_lbs) ?? firstLastDelta(monthMeasurements, (r) => r.weight_lbs);
  const waistDelta = firstLastDelta(monthDaily, (r) => r.waist_in) ?? firstLastDelta(monthMeasurements, (r) => r.waist_in);

  const adherenceScore = round1(clamp01(
    ((monthSessions.length / Math.max(1, expectedWorkouts)) * 0.7) +
      ((monthDaily.length / Math.max(8, daysInRange * 0.5)) * 0.2) +
      ((anchorCompleteness ?? 0) * 0.1)
  ));

  const progressionRate = progressionOpportunities > 0 ? progressionHits / progressionOpportunities : null;
  const momentumComponents: number[] = [];
  if (progressionRate != null) momentumComponents.push((progressionRate - 0.5) * 1.1);
  if (waistDelta != null) momentumComponents.push(Math.max(-1, Math.min(1, -waistDelta / 2)) * 0.9);
  if (adherenceScore != null) momentumComponents.push((adherenceScore - 0.5) * 0.8);
  if (hardSets.length > 0) momentumComponents.push(Math.max(-1, Math.min(1, (hardSets.length / Math.max(1, expectedWorkouts * 10)) - 0.5)) * 0.5);
  const momentumSignal = momentumComponents.length ? round1(momentumComponents.reduce((a, b) => a + b, 0) / momentumComponents.length) : null;

  return {
    monthKey,
    startYMD,
    endYMD,
    daysInRange,
    quicklogDays: sortByDate(monthDaily).length,
    measurementDays: sortByDate(monthMeasurements).length,
    anchorDays,
    anchorCompleteness,
    weightDelta: round1(weightDelta),
    waistDelta: round1(waistDelta),
    avgSleep: round1(avg(sortByDate(monthDaily).map((r) => r.sleep_hours))),
    avgProtein: round1(avg(sortByDate(monthNutrition).map((r) => r.protein_g))),
    avgZone2Minutes: round1(avg(sortByDate(monthZone2).map((r) => r.minutes))),
    workoutsCompleted: analyticSessions.length,
    expectedWorkouts,
    uniqueTrainingDays: new Set(analyticSessions.map((s) => s.day_date)).size,
    totalExercises: exercises.length,
    totalSets: sets.length,
    hardSets: hardSets.length,
    compoundSetShare: hardSets.length ? round1(compoundHardSets / hardSets.length) : null,
    upperSetShare: hardSets.length ? round1(upperSets / hardSets.length) : null,
    lowerSetShare: hardSets.length ? round1(lowerSets / hardSets.length) : null,
    pushSetShare: hardSets.length ? round1(pushSets / hardSets.length) : null,
    pullSetShare: hardSets.length ? round1(pullSets / hardSets.length) : null,
    pushPullBalance: pushSets > 0 && pullSets > 0 ? round1(Math.min(pushSets, pullSets) / Math.max(pushSets, pullSets)) : null,
    adherenceScore,
    progressionHits,
    progressionOpportunities,
    momentumSignal,
    visionSupport: parseVisionSupport(visionText),
    hasEnoughData:
      monthDaily.length >= 4 ||
      monthMeasurements.length >= 2 ||
      analyticSessions.length >= 4 ||
      anchorDays >= 1,
  };
}


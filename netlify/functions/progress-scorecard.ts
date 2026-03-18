import type { Handler } from "@netlify/functions";

type ProgressSignals = {
  quicklogDays?: number | null;
  measurementDays?: number | null;
  anchorDays?: number | null;
  anchorCompleteness?: number | null;
  weightDelta?: number | null;
  waistDelta?: number | null;
  avgSleep?: number | null;
  avgProtein?: number | null;
  avgZone2Minutes?: number | null;
  workoutsCompleted?: number | null;
  expectedWorkouts?: number | null;
  uniqueTrainingDays?: number | null;
  totalExercises?: number | null;
  totalSets?: number | null;
  hardSets?: number | null;
  compoundSetShare?: number | null;
  upperSetShare?: number | null;
  lowerSetShare?: number | null;
  pushSetShare?: number | null;
  pullSetShare?: number | null;
  pushPullBalance?: number | null;
  adherenceScore?: number | null;
  progressionHits?: number | null;
  progressionOpportunities?: number | null;
  momentumSignal?: number | null;
  visionSupport?: number | null;
  hasEnoughData?: boolean;
};

type ReqBody = {
  month?: string;
  startYMD?: string;
  endYMD?: string;
  stats?: {
    signals?: ProgressSignals | null;
    vision_context?: { text?: string | null } | null;
    [key: string]: any;
  };
  images?: { label: string; url: string }[];
};

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 5;
  return Math.max(1, Math.min(10, Math.round(v * 10) / 10));
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ratio(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b <= 0) return null;
  return a / b;
}

function pickMomentum(signal: number | null): "up" | "down" | "flat" {
  if (signal == null) return "flat";
  if (signal >= 0.18) return "up";
  if (signal <= -0.18) return "down";
  return "flat";
}

function scoreConsistency(s: ProgressSignals): number {
  const adherence = num(s.adherenceScore);
  const quicklogDays = num(s.quicklogDays) ?? 0;
  const anchorCompleteness = num(s.anchorCompleteness) ?? 0;
  const measurementDays = num(s.measurementDays) ?? 0;
  const expectedWorkouts = Math.max(1, num(s.expectedWorkouts) ?? 12);
  const workouts = num(s.workoutsCompleted) ?? 0;
  const completion = Math.max(0, Math.min(1.2, workouts / expectedWorkouts));
  const logging = Math.max(0, Math.min(1, quicklogDays / 20));
  const measurements = Math.max(0, Math.min(1, measurementDays / 4));
  const base = 3.8 + completion * 3.2 + logging * 1.4 + anchorCompleteness * 0.8 + measurements * 0.8;
  return clampScore(adherence == null ? base : base + (adherence - 0.5) * 1.8);
}

function scoreWaistControl(s: ProgressSignals): number {
  const waistDelta = num(s.waistDelta);
  const zone2 = num(s.avgZone2Minutes);
  let score = 5.2;
  if (waistDelta != null) {
    if (waistDelta <= -1.0) score += 2.4;
    else if (waistDelta <= -0.5) score += 1.6;
    else if (waistDelta <= -0.1) score += 0.8;
    else if (waistDelta < 0.25) score += 0.2;
    else if (waistDelta < 0.75) score -= 0.7;
    else score -= 1.6;
  }
  if (zone2 != null) score += Math.max(0, Math.min(1.1, zone2 / 90));
  return clampScore(score);
}

function scoreConditioning(s: ProgressSignals): number {
  const zone2 = num(s.avgZone2Minutes);
  const sleep = num(s.avgSleep);
  const waistDelta = num(s.waistDelta);
  const adherence = num(s.adherenceScore);
  let score = 4.8;
  if (zone2 != null) {
    if (zone2 >= 45) score += 2.0;
    else if (zone2 >= 25) score += 1.2;
    else if (zone2 >= 10) score += 0.5;
  }
  if (sleep != null) {
    if (sleep >= 7) score += 1.0;
    else if (sleep >= 6) score += 0.5;
    else if (sleep < 5) score -= 0.8;
  }
  if (waistDelta != null) {
    if (waistDelta <= -0.5) score += 0.9;
    else if (waistDelta >= 0.5) score -= 0.8;
  }
  if (adherence != null) score += (adherence - 0.5) * 1.2;
  return clampScore(score);
}

function scoreMuscularity(s: ProgressSignals): number {
  const hardSets = num(s.hardSets) ?? 0;
  const expectedWorkouts = Math.max(1, num(s.expectedWorkouts) ?? 12);
  const progressionHits = num(s.progressionHits) ?? 0;
  const progressionOpps = Math.max(0, num(s.progressionOpportunities) ?? 0);
  const compoundShare = num(s.compoundSetShare);
  const protein = num(s.avgProtein);
  const visionSupport = num(s.visionSupport);
  const hardSetsPerExpectedWorkout = hardSets / expectedWorkouts;
  const progressionRate = progressionOpps > 0 ? progressionHits / progressionOpps : null;
  let score = 4.6;
  if (hardSetsPerExpectedWorkout >= 12) score += 2.2;
  else if (hardSetsPerExpectedWorkout >= 8) score += 1.6;
  else if (hardSetsPerExpectedWorkout >= 5) score += 0.8;
  if (progressionRate != null) score += (progressionRate - 0.45) * 2.8;
  if (compoundShare != null) score += (compoundShare - 0.45) * 1.4;
  if (protein != null) {
    if (protein >= 190) score += 1.0;
    else if (protein >= 150) score += 0.6;
    else if (protein < 110) score -= 0.5;
  }
  if (visionSupport != null) score += (visionSupport - 0.5) * 1.2;
  return clampScore(score);
}

function scoreSymmetry(s: ProgressSignals): number {
  const lowerShare = num(s.lowerSetShare);
  const upperShare = num(s.upperSetShare);
  const pushPullBalance = num(s.pushPullBalance);
  const anchorCompleteness = num(s.anchorCompleteness);
  const visionSupport = num(s.visionSupport);
  let score = 5.0;
  if (lowerShare != null && upperShare != null) {
    const gap = Math.abs(lowerShare - upperShare);
    if (gap <= 0.15) score += 1.4;
    else if (gap <= 0.25) score += 0.8;
    else if (gap >= 0.45) score -= 0.8;
  }
  if (pushPullBalance != null) {
    if (pushPullBalance >= 0.9) score += 1.5;
    else if (pushPullBalance >= 0.75) score += 0.9;
    else if (pushPullBalance < 0.5) score -= 0.8;
  }
  if (anchorCompleteness != null) score += anchorCompleteness * 0.8;
  if (visionSupport != null) score += (visionSupport - 0.5) * 0.8;
  return clampScore(score);
}

function buildNotes(scorecard: {
  conditioning: number;
  muscularity: number;
  symmetry: number;
  waist_control: number;
  consistency: number;
  momentum: "up" | "down" | "flat";
},
signals: ProgressSignals): string {
  const bits: string[] = [];
  const workouts = num(signals.workoutsCompleted) ?? 0;
  const expected = num(signals.expectedWorkouts) ?? 0;
  const hardSets = num(signals.hardSets) ?? 0;
  const progressionHits = num(signals.progressionHits) ?? 0;
  const progressionOpps = num(signals.progressionOpportunities) ?? 0;
  const waistDelta = num(signals.waistDelta);

  if (scorecard.consistency >= 7) bits.push(`Consistency is carrying the month: ${workouts}/${expected || 0} workouts landed with ${hardSets} hard sets logged.`);
  else if (scorecard.consistency <= 5.5) bits.push(`Consistency is the drag right now: only ${workouts}/${expected || 0} expected workouts are showing up cleanly.`);

  if (scorecard.muscularity >= 7 && progressionOpps > 0) bits.push(`Muscularity is being supported by real work, with ${progressionHits}/${progressionOpps} tracked progression opportunities moving the right direction.`);
  else if (scorecard.muscularity <= 5.5) bits.push(`Muscularity needs more honest overload — either more productive hard sets, better progression, or both.`);

  if (waistDelta != null) {
    if (waistDelta <= -0.3) bits.push(`Waist trend is helping the picture, down ${Math.abs(waistDelta).toFixed(1)} inches across the month window.`);
    else if (waistDelta >= 0.3) bits.push(`Waist control is slipping a bit, up ${waistDelta.toFixed(1)} inches in the current month window.`);
  }

  if (!bits.length) bits.push(`This month reads as ${scorecard.momentum} momentum overall, with the scorecard staying grounded in logged training, measurements, and anchor coverage.`);
  return bits.slice(0, 3).join(" ");
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
    }

    const body: ReqBody = event.body ? JSON.parse(event.body) : {};
    const signals = (body.stats?.signals ?? null) as ProgressSignals | null;
    if (!signals) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing deterministic progress signals" }) };
    }

    const conditioning = scoreConditioning(signals);
    const muscularity = scoreMuscularity(signals);
    const symmetry = scoreSymmetry(signals);
    const waist_control = scoreWaistControl(signals);
    const consistency = scoreConsistency(signals);
    const momentum = pickMomentum(num(signals.momentumSignal));

    const scorecard = {
      conditioning,
      muscularity,
      symmetry,
      waist_control,
      consistency,
      momentum,
      notes: buildNotes({ conditioning, muscularity, symmetry, waist_control, consistency, momentum }, signals),
    };

    return { statusCode: 200, body: JSON.stringify({ scorecard, signals_used: signals }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ message: e?.message ?? String(e) }) };
  }
};


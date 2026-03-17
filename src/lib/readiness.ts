import {
  ReadinessInput,
  ReadinessContext,
  TrendDirection,
  ConfidenceLevel,
  ReadinessStatus,
} from "./readinessTypes";

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function computeAdherence(workouts: ReadinessInput["workouts"], days: number) {
  const cutoff = daysAgo(days);

  const recent = workouts.filter(w => new Date(w.date) >= cutoff);

  if (recent.length === 0) return null;

  const completed = recent.filter(w => w.completed).length;

  return completed / recent.length;
}

function computeSessionDensity(workouts: ReadinessInput["workouts"], days: number) {
  const cutoff = daysAgo(days);

  const recent = workouts.filter(w => new Date(w.date) >= cutoff && w.completed);

  return recent.length;
}

function computeBodyweightTrend(data: ReadinessInput["bodyweight"]): TrendDirection {
  if (data.length < 3) return "unknown";

  const recent = data.slice(-14);

  if (recent.length < 2) return "unknown";

  const first = recent[0].weight;
  const last = recent[recent.length - 1].weight;

  const diff = last - first;

  if (Math.abs(diff) < 0.2) return "flat";

  return diff > 0 ? "up" : "down";
}

function computeScorecardTrend(data: ReadinessInput["scorecards"]): TrendDirection {
  if (data.length < 2) return "unknown";

  const last = data[data.length - 1].score;
  const prev = data[data.length - 2].score;

  if (last > prev) return "up";
  if (last < prev) return "down";

  return "flat";
}

function computeSignalCoverage(input: ReadinessInput) {
  let signals = 0;

  if (input.workouts.length > 0) signals++;
  if (input.bodyweight.length > 0) signals++;
  if (input.scorecards.length > 0) signals++;

  return signals / 3;
}

function deriveConfidence(signalCoverage: number): ConfidenceLevel {
  if (signalCoverage >= 0.8) return "high";
  if (signalCoverage >= 0.5) return "medium";
  return "low";
}

function deriveStatus(
  adherence: number | null,
  density: number | null,
  confidence: ConfidenceLevel
): ReadinessStatus {

  if (confidence === "low") return "low_signal_confidence";

  if (adherence !== null && adherence >= 0.85 && density !== null && density >= 3)
    return "ready_to_push";

  if (adherence !== null && adherence < 0.5)
    return "recovery_constrained";

  if (density !== null && density >= 5)
    return "watch_fatigue";

  return "stable_normal";
}

export function buildReadinessContext(input: ReadinessInput): ReadinessContext {

  const adherence7d = computeAdherence(input.workouts, 7);
  const adherence28d = computeAdherence(input.workouts, 28);

  const sessionDensity7d = computeSessionDensity(input.workouts, 7);

  const bodyweightTrend14d = computeBodyweightTrend(input.bodyweight);

  const scorecardTrend = computeScorecardTrend(input.scorecards);

  const signalCoverage = computeSignalCoverage(input);

  const confidence = deriveConfidence(signalCoverage);

  const status = deriveStatus(adherence7d, sessionDensity7d, confidence);

  return {
    status,
    confidence,

    summary: {
      label: status,
      reasonShort: "Derived readiness based on recent training signals",
    },

    metrics: {
      adherence7d,
      adherence28d,
      sessionDensity7d,
      bodyweightTrend14d,
      scorecardTrend,
      signalCoverage,
    },

    drivers: [],

    watchFlags: [],
  };
}

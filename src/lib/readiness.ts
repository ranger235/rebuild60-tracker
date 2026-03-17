import {
  ReadinessInput,
  ReadinessContext,
  TrendDirection,
  ConfidenceLevel,
  ReadinessStatus,
  DriverSignal,
  WatchFlag,
  PrescriptionTrustLevel,
} from "./readinessTypes";

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function computeAdherence(workouts: ReadinessInput["workouts"], days: number) {
  const cutoff = daysAgo(days);
  const recent = workouts.filter((w) => new Date(w.date) >= cutoff);
  if (recent.length === 0) return null;
  const completed = recent.filter((w) => w.completed).length;
  return completed / recent.length;
}

function computeSessionDensity(workouts: ReadinessInput["workouts"], days: number) {
  const cutoff = daysAgo(days);
  const recent = workouts.filter((w) => new Date(w.date) >= cutoff && w.completed);
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

function getRecentFidelityScores(input: ReadinessInput, days = 35) {
  const cutoff = daysAgo(days).getTime();
  return (input.preferenceHistory ?? [])
    .filter((entry) => typeof entry.timestamp === "number" && entry.timestamp >= cutoff)
    .map((entry) => entry.fidelityScore)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function computeRecentFidelityAvg(input: ReadinessInput): number | null {
  const scores = getRecentFidelityScores(input);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function computeFidelityTrend(input: ReadinessInput): TrendDirection {
  const scores = getRecentFidelityScores(input);
  if (scores.length < 4) return "unknown";
  const recent = scores.slice(-3);
  const prior = scores.slice(-6, -3);
  if (prior.length === 0) return "unknown";
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const diff = recentAvg - priorAvg;
  if (Math.abs(diff) < 4) return "flat";
  return diff > 0 ? "up" : "down";
}

function derivePrescriptionTrust(avg: number | null): PrescriptionTrustLevel {
  if (avg == null) return "unknown";
  if (avg >= 85) return "high";
  if (avg >= 70) return "moderate";
  return "low";
}

function computeSignalCoverage(input: ReadinessInput) {
  let signals = 0;
  if (input.workouts.length > 0) signals++;
  if (input.bodyweight.length > 0) signals++;
  if (input.scorecards.length > 0) signals++;
  if (getRecentFidelityScores(input).length > 0) signals++;
  return signals / 4;
}

function deriveConfidence(signalCoverage: number): ConfidenceLevel {
  if (signalCoverage >= 0.8) return "high";
  if (signalCoverage >= 0.5) return "medium";
  return "low";
}

function deriveStatus(
  adherence: number | null,
  density: number | null,
  confidence: ConfidenceLevel,
  recentFidelityAvg: number | null
): ReadinessStatus {
  if (confidence === "low") return "low_signal_confidence";
  if (recentFidelityAvg != null && recentFidelityAvg < 60 && density !== null && density >= 3) {
    return "recovery_constrained";
  }
  if (adherence !== null && adherence >= 0.85 && density !== null && density >= 3 && (recentFidelityAvg == null || recentFidelityAvg >= 75))
    return "ready_to_push";
  if (adherence !== null && adherence < 0.5) return "recovery_constrained";
  if (density !== null && density >= 5) return "watch_fatigue";
  return "stable_normal";
}

function buildDrivers(params: {
  adherence7d: number | null;
  sessionDensity7d: number | null;
  recentFidelityAvg: number | null;
  fidelityTrend: TrendDirection;
  prescriptionTrust: PrescriptionTrustLevel;
  confidence: ConfidenceLevel;
}): DriverSignal[] {
  const drivers: DriverSignal[] = [];
  const { adherence7d, sessionDensity7d, recentFidelityAvg, fidelityTrend, prescriptionTrust, confidence } = params;

  if (recentFidelityAvg != null) {
    if (recentFidelityAvg >= 85) {
      drivers.push({
        key: "fidelity-strong",
        label: "Recent session fidelity has been strong",
        direction: "positive",
        strength: "high",
        detail: `Average recent fidelity is ${Math.round(recentFidelityAvg)}%, so the system can trust the prescription signal more.`
      });
    } else if (recentFidelityAvg >= 70) {
      drivers.push({
        key: "fidelity-mixed",
        label: "Recent session fidelity has been serviceable",
        direction: "neutral",
        strength: "medium",
        detail: `Average recent fidelity is ${Math.round(recentFidelityAvg)}%, so the signal is useful but not bulletproof.`
      });
    } else {
      drivers.push({
        key: "fidelity-soft",
        label: "Recent sessions have diverged from prescription",
        direction: "negative",
        strength: "high",
        detail: `Average recent fidelity is ${Math.round(recentFidelityAvg)}%, so reality needs more respect than the plan right now.`
      });
    }
  }

  if (fidelityTrend === "up") {
    drivers.push({
      key: "fidelity-up",
      label: "Fidelity trend is improving",
      direction: "positive",
      strength: "medium",
      detail: "Recent sessions are landing closer to prescription than the earlier part of the window."
    });
  } else if (fidelityTrend === "down") {
    drivers.push({
      key: "fidelity-down",
      label: "Fidelity trend is slipping",
      direction: "negative",
      strength: "medium",
      detail: "Recent sessions are bending away from prescription more than earlier in the window."
    });
  }

  if (adherence7d != null && adherence7d >= 0.85) {
    drivers.push({
      key: "adherence-strong",
      label: "Adherence has been strong over the last week",
      direction: "positive",
      strength: "medium",
      detail: `Seven-day adherence is ${Math.round(adherence7d * 100)}%.`
    });
  } else if (adherence7d != null && adherence7d < 0.6) {
    drivers.push({
      key: "adherence-soft",
      label: "Adherence has been soft over the last week",
      direction: "negative",
      strength: "medium",
      detail: `Seven-day adherence is ${Math.round(adherence7d * 100)}%.`
    });
  }

  if (sessionDensity7d != null && sessionDensity7d >= 5) {
    drivers.push({
      key: "density-high",
      label: "Session density is elevated this week",
      direction: "neutral",
      strength: "medium",
      detail: `${sessionDensity7d} completed sessions landed in the last 7 days.`
    });
  }

  if (prescriptionTrust === "high") {
    drivers.push({
      key: "trust-high",
      label: "Prescription trust is high",
      direction: "positive",
      strength: "medium",
      detail: "Recent execution says the current recommendation signal is landing well."
    });
  } else if (prescriptionTrust === "low") {
    drivers.push({
      key: "trust-low",
      label: "Prescription trust is low",
      direction: "negative",
      strength: "high",
      detail: "Recent execution says the system should stay conservative until reality tightens back up."
    });
  }

  if (confidence === "low") {
    drivers.push({
      key: "confidence-low",
      label: "Signal coverage is limited",
      direction: "neutral",
      strength: "low",
      detail: "The dashboard is making the best call it can, but the data window is still thin."
    });
  }

  return drivers.slice(0, 4);
}

function buildWatchFlags(params: {
  adherence7d: number | null;
  recentFidelityAvg: number | null;
  fidelityTrend: TrendDirection;
  prescriptionTrust: PrescriptionTrustLevel;
  confidence: ConfidenceLevel;
}): WatchFlag[] {
  const flags: WatchFlag[] = [];
  const { adherence7d, recentFidelityAvg, fidelityTrend, prescriptionTrust, confidence } = params;

  if (confidence === "low") {
    flags.push({ key: "low-coverage", label: "Low recent data coverage", severity: "watch" });
  }
  if (prescriptionTrust === "low") {
    flags.push({ key: "low-trust", label: "Recent sessions frequently diverge from plan", severity: "high" });
  }
  if (recentFidelityAvg != null && recentFidelityAvg < 65) {
    flags.push({ key: "low-fidelity", label: "Prescription fidelity is running soft", severity: "watch" });
  }
  if (fidelityTrend === "down") {
    flags.push({ key: "fidelity-down", label: "Fidelity trend is declining", severity: "watch" });
  }
  if (adherence7d != null && adherence7d < 0.6) {
    flags.push({ key: "adherence-down", label: "Adherence needs attention", severity: "watch" });
  }

  return flags.slice(0, 3);
}

export function buildReadinessContext(input: ReadinessInput): ReadinessContext {
  const adherence7d = computeAdherence(input.workouts, 7);
  const adherence28d = computeAdherence(input.workouts, 28);
  const sessionDensity7d = computeSessionDensity(input.workouts, 7);
  const bodyweightTrend14d = computeBodyweightTrend(input.bodyweight);
  const scorecardTrend = computeScorecardTrend(input.scorecards);
  const recentFidelityAvg = computeRecentFidelityAvg(input);
  const fidelityTrend = computeFidelityTrend(input);
  const prescriptionTrust = derivePrescriptionTrust(recentFidelityAvg);
  const signalCoverage = computeSignalCoverage(input);
  const confidence = deriveConfidence(signalCoverage);
  const status = deriveStatus(adherence7d, sessionDensity7d, confidence, recentFidelityAvg);
  const drivers = buildDrivers({
    adherence7d,
    sessionDensity7d,
    recentFidelityAvg,
    fidelityTrend,
    prescriptionTrust,
    confidence,
  });
  const watchFlags = buildWatchFlags({
    adherence7d,
    recentFidelityAvg,
    fidelityTrend,
    prescriptionTrust,
    confidence,
  });

  const reasonShort = recentFidelityAvg == null
    ? "Derived readiness from training density, bodyweight trend, and the signal we actually have right now."
    : `Derived readiness from recent training signals plus ${Math.round(recentFidelityAvg)}% average session fidelity.`;

  return {
    status,
    confidence,
    summary: {
      label: status,
      reasonShort,
    },
    metrics: {
      adherence7d,
      adherence28d,
      sessionDensity7d,
      bodyweightTrend14d,
      scorecardTrend,
      recentFidelityAvg,
      fidelityTrend,
      prescriptionTrust,
      signalCoverage,
    },
    drivers,
    watchFlags,
  };
}


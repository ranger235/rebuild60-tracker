import type { BrainSnapshot } from "./brainEngine";
import type { FrictionProfile } from "./frictionEngine";
import type { PreferenceHistoryEntry } from "./preferenceLearning";

export type BehaviorTraitKey =
  | "splitCompliance"
  | "lowerDayReliability"
  | "anchorLoyalty"
  | "substitutionTendency"
  | "delayTendency"
  | "completionReliability";

export type BehaviorTrait = {
  key: BehaviorTraitKey;
  label: string;
  score: number;
  confidence: number;
  trend: "up" | "down" | "flat";
  evidence: number;
  summary: string;
};

export type BehaviorFingerprint = {
  generatedAt: string;
  evidenceWindow: number;
  confidence: number;
  headline: string;
  stableSignals: string[];
  watchouts: string[];
  traits: Record<BehaviorTraitKey, BehaviorTrait>;
};

export type PredictionScaffold = {
  generatedAt: string;
  confidence: number;
  predictedCompletion: "as_prescribed" | "modified" | "partial";
  predictedDelayBucket: "same_day" | "1_day" | "2_plus_days";
  predictedFocusMatchProbability: number;
  predictedSubstitutionRisk: number;
  predictedAnchorReliability: number;
  reasons: string[];
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(part: number, total: number, fallback = 0): number {
  if (!total) return fallback;
  return part / total;
}

function trendFromNumbers(recent: number[], older: number[]): "up" | "down" | "flat" {
  const recentAvg = avg(recent);
  const olderAvg = avg(older);
  if (recentAvg == null || olderAvg == null) return "flat";
  if (recentAvg >= olderAvg + 8) return "up";
  if (recentAvg <= olderAvg - 8) return "down";
  return "flat";
}

function buildTrait(params: {
  key: BehaviorTraitKey;
  label: string;
  score: number;
  evidence: number;
  trend: "up" | "down" | "flat";
  summary: string;
  confidenceBase?: number;
}): BehaviorTrait {
  const confidence = clamp((params.confidenceBase ?? 35) + params.evidence * 7, 35, 92);
  return {
    key: params.key,
    label: params.label,
    score: clamp(params.score, 0, 100),
    confidence,
    trend: params.trend,
    evidence: params.evidence,
    summary: params.summary,
  };
}

export function deriveBehaviorFingerprint(
  history: PreferenceHistoryEntry[],
  frictionProfile?: FrictionProfile | null,
): BehaviorFingerprint {
  const recent = history
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);
  const older = history
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(12, 24);

  if (!recent.length) {
    const emptyTrait = (key: BehaviorTraitKey, label: string, summary: string): BehaviorTrait => ({
      key,
      label,
      score: 50,
      confidence: 35,
      trend: "flat",
      evidence: 0,
      summary,
    });

    return {
      generatedAt: new Date().toISOString(),
      evidenceWindow: 0,
      confidence: 35,
      headline: "Calibrating the behavior model from completed recommendation cycles.",
      stableSignals: ["The self-model needs a few completed recommendation reviews before it can stop guessing."],
      watchouts: ["No durable behavioral fingerprint yet."],
      traits: {
        splitCompliance: emptyTrait("splitCompliance", "Split compliance", "No completed recommendation evidence yet."),
        lowerDayReliability: emptyTrait("lowerDayReliability", "Lower-day reliability", "No lower-day evidence yet."),
        anchorLoyalty: emptyTrait("anchorLoyalty", "Anchor loyalty", "Primary lift follow-through is still unknown."),
        substitutionTendency: emptyTrait("substitutionTendency", "Substitution tendency", "Exercise swapping pattern is still unknown."),
        delayTendency: emptyTrait("delayTendency", "Delay tendency", "Recommendation timing pattern is still unknown."),
        completionReliability: emptyTrait("completionReliability", "Completion reliability", "Session completion pattern is still unknown."),
      },
    };
  }

  const focusMatchCount = recent.filter((entry) => entry.recommendedFocus && entry.actualFocus && entry.recommendedFocus === entry.actualFocus).length;
  const lowerEntries = recent.filter((entry) => entry.recommendedFocus === "Lower");
  const lowerMatchCount = lowerEntries.filter((entry) => entry.actualFocus === "Lower").length;
  const anchorSignals = recent.map((entry) => {
    if (entry.primaryOutcome === "progressed") return 90;
    if (entry.primaryOutcome === "matched") return 75;
    if (entry.primaryOutcome === "regressed") return 35;
    return 55;
  });
  const substitutionRates = recent.map((entry) => {
    const substitutions = entry.substitutionKeys?.length ?? 0;
    const exercises = Math.max(1, entry.exerciseFidelity?.length ?? 0, entry.missedKeys?.length ?? 0, entry.extrasKeys?.length ?? 0);
    return ratio(substitutions, exercises, 0);
  });
  const delayedCount = recent.filter((entry) => (entry.daysSinceRecommendation ?? 0) >= 2).length;
  const completionSignals = recent.map((entry) => {
    if (entry.sessionOutcome === "as_prescribed") return 92;
    if (entry.sessionOutcome === "modified") return 72;
    if (entry.sessionOutcome === "partial") return 42;
    if (entry.sessionOutcome === "abandoned") return 18;
    return typeof entry.fidelityScore === "number" ? entry.fidelityScore : 60;
  });

  const olderFocusMatch = older.map((entry) => entry.recommendedFocus && entry.actualFocus && entry.recommendedFocus === entry.actualFocus ? 100 : 45);
  const recentFocusMatch = recent.map((entry) => entry.recommendedFocus && entry.actualFocus && entry.recommendedFocus === entry.actualFocus ? 100 : 45);
  const recentLower = lowerEntries.map((entry) => entry.actualFocus === "Lower" ? 100 : 35);
  const olderLower = older.filter((entry) => entry.recommendedFocus === "Lower").map((entry) => entry.actualFocus === "Lower" ? 100 : 35);
  const recentAnchor = anchorSignals;
  const olderAnchor = older.map((entry) => {
    if (entry.primaryOutcome === "progressed") return 90;
    if (entry.primaryOutcome === "matched") return 75;
    if (entry.primaryOutcome === "regressed") return 35;
    return 55;
  });
  const recentSubstitution = substitutionRates.map((value) => Math.round(value * 100));
  const olderSubstitution = older.map((entry) => {
    const substitutions = entry.substitutionKeys?.length ?? 0;
    const exercises = Math.max(1, entry.exerciseFidelity?.length ?? 0, entry.missedKeys?.length ?? 0, entry.extrasKeys?.length ?? 0);
    return Math.round(ratio(substitutions, exercises, 0) * 100);
  });
  const recentDelay = recent.map((entry) => (entry.daysSinceRecommendation ?? 0) >= 2 ? 100 : (entry.daysSinceRecommendation ?? 0) === 1 ? 55 : 15);
  const olderDelay = older.map((entry) => (entry.daysSinceRecommendation ?? 0) >= 2 ? 100 : (entry.daysSinceRecommendation ?? 0) === 1 ? 55 : 15);
  const recentCompletion = completionSignals;
  const olderCompletion = older.map((entry) => {
    if (entry.sessionOutcome === "as_prescribed") return 92;
    if (entry.sessionOutcome === "modified") return 72;
    if (entry.sessionOutcome === "partial") return 42;
    if (entry.sessionOutcome === "abandoned") return 18;
    return typeof entry.fidelityScore === "number" ? entry.fidelityScore : 60;
  });

  const splitComplianceScore = clamp(Math.round(ratio(focusMatchCount, recent.length, 0.55) * 100), 20, 95);
  const lowerDayReliabilityScore = clamp(
    lowerEntries.length ? Math.round(ratio(lowerMatchCount, lowerEntries.length, 0.55) * 100) : splitComplianceScore,
    20,
    95,
  );
  const anchorLoyaltyScore = clamp(Math.round(avg(anchorSignals) ?? 55), 20, 95);
  const substitutionTendencyScore = clamp(Math.round((avg(substitutionRates) ?? 0.22) * 100), 5, 95);
  const delayTendencyScore = clamp(Math.round(ratio(delayedCount, recent.length, 0.2) * 100), 5, 95);
  const completionReliabilityScore = clamp(Math.round(avg(completionSignals) ?? 60), 15, 95);

  const traits: Record<BehaviorTraitKey, BehaviorTrait> = {
    splitCompliance: buildTrait({
      key: "splitCompliance",
      label: "Split compliance",
      score: splitComplianceScore,
      evidence: recent.length,
      trend: trendFromNumbers(recentFocusMatch, olderFocusMatch),
      summary: splitComplianceScore >= 75
        ? "Recent actual sessions are still landing in the same broad lane the engine prescribed."
        : "Recent sessions are slipping away from the planned lane often enough that the model should stay humble.",
      confidenceBase: 42,
    }),
    lowerDayReliability: buildTrait({
      key: "lowerDayReliability",
      label: "Lower-day reliability",
      score: lowerDayReliabilityScore,
      evidence: lowerEntries.length,
      trend: trendFromNumbers(recentLower, olderLower),
      summary: lowerEntries.length === 0
        ? "No recent Lower prescriptions yet, so this trait is borrowing confidence from broader split compliance."
        : lowerDayReliabilityScore >= 70
          ? "When the engine calls Lower, reality usually keeps the day recognizably Lower."
          : "Lower prescriptions are where behavior drift has been showing its teeth.",
      confidenceBase: lowerEntries.length > 0 ? 38 : 32,
    }),
    anchorLoyalty: buildTrait({
      key: "anchorLoyalty",
      label: "Anchor loyalty",
      score: anchorLoyaltyScore,
      evidence: recent.filter((entry) => entry.primaryOutcome != null).length,
      trend: trendFromNumbers(recentAnchor, olderAnchor),
      summary: anchorLoyaltyScore >= 72
        ? "Primary lift reality is mostly holding together, which gives progression a decent footing."
        : "Primary lift follow-through has been soft enough that the engine should not strut around like it owns the place.",
      confidenceBase: 38,
    }),
    substitutionTendency: buildTrait({
      key: "substitutionTendency",
      label: "Substitution tendency",
      score: substitutionTendencyScore,
      evidence: recent.length,
      trend: trendFromNumbers(recentSubstitution, olderSubstitution),
      summary: substitutionTendencyScore <= 25
        ? "Exercise selection is staying pretty faithful to the script."
        : substitutionTendencyScore <= 45
          ? "You bend the accessory edges now and then, which is useful signal rather than a crime."
          : "Exercise swaps are common enough that the model should treat exact exercise identity as negotiable.",
      confidenceBase: 40,
    }),
    delayTendency: buildTrait({
      key: "delayTendency",
      label: "Delay tendency",
      score: delayTendencyScore,
      evidence: recent.length,
      trend: trendFromNumbers(recentDelay, olderDelay),
      summary: delayTendencyScore <= 25
        ? "Recommendations are usually landing on time or close to it."
        : delayTendencyScore <= 50
          ? "A little session drift is part of the current rhythm, but not chaos."
          : "The recommendation-to-execution gap is big enough that stale-plan drift should be treated as real context.",
      confidenceBase: 40,
    }),
    completionReliability: buildTrait({
      key: "completionReliability",
      label: "Completion reliability",
      score: completionReliabilityScore,
      evidence: recent.length,
      trend: trendFromNumbers(recentCompletion, olderCompletion),
      summary: completionReliabilityScore >= 78
        ? "Once you start, the session usually gets finished in one form or another."
        : completionReliabilityScore >= 60
          ? "Completion is workable, but the engine should still respect friction before piling on fluff."
          : "Completion quality has been rough enough that continuity matters more than ideal prescription density.",
      confidenceBase: 42,
    }),
  };

  if (frictionProfile?.level === "high") {
    traits.completionReliability = {
      ...traits.completionReliability,
      score: clamp(traits.completionReliability.score - 8, 0, 100),
      summary: `${traits.completionReliability.summary} Current friction is also leaning against clean completion.`
    };
    traits.delayTendency = {
      ...traits.delayTendency,
      score: clamp(traits.delayTendency.score + 8, 0, 100),
      summary: `${traits.delayTendency.summary} Friction says the week is already trying to gum up the works.`
    };
  }

  const stableSignals: string[] = [];
  const watchouts: string[] = [];

  if (traits.splitCompliance.score >= 75) stableSignals.push("Configured split calls are still broadly lining up with actual behavior.");
  if (traits.anchorLoyalty.score >= 72) stableSignals.push("Primary lift follow-through is strong enough to trust progression a bit more.");
  if (traits.completionReliability.score >= 75) stableSignals.push("Completion reliability is giving the engine decent runway.");
  if (traits.substitutionTendency.score >= 45) watchouts.push("Exercise identity is not sacred in real life right now; accessory precision should stay on a short leash.");
  if (traits.delayTendency.score >= 45) watchouts.push("Recommendation timing drift is large enough that stale-session context matters.");
  if (traits.lowerDayReliability.score <= 60) watchouts.push("Lower-day follow-through remains the shakiest part of the current loop.");

  const confidence = clamp(
    Math.round(Object.values(traits).reduce((sum, trait) => sum + trait.confidence, 0) / Object.values(traits).length),
    35,
    92,
  );

  const headline =
    traits.splitCompliance.score >= 75 && traits.completionReliability.score >= 75
      ? "The self-model sees a trainee who mostly follows the lane, but still edits the edges when reality gets lippy."
      : traits.substitutionTendency.score >= 45 || traits.delayTendency.score >= 45
        ? "The self-model sees a trainee who protects continuity first and treats the exact script as negotiable."
        : "The self-model is finding a usable rhythm, but it still needs more clean cycles before swagger is earned.";

  return {
    generatedAt: new Date().toISOString(),
    evidenceWindow: recent.length,
    confidence,
    headline,
    stableSignals: stableSignals.slice(0, 3),
    watchouts: watchouts.slice(0, 3),
    traits,
  };
}

export function buildPredictionScaffold(params: {
  history: PreferenceHistoryEntry[];
  fingerprint: BehaviorFingerprint | null | undefined;
  brainSnapshot: BrainSnapshot | null | undefined;
  frictionProfile?: FrictionProfile | null;
}): PredictionScaffold | null {
  const { history, fingerprint, brainSnapshot, frictionProfile } = params;
  if (!fingerprint || !brainSnapshot?.recommendedSession) return null;

  const latest = history
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 8);

  const split = fingerprint.traits.splitCompliance.score;
  const lower = fingerprint.traits.lowerDayReliability.score;
  const anchor = fingerprint.traits.anchorLoyalty.score;
  const substitution = fingerprint.traits.substitutionTendency.score;
  const delay = fingerprint.traits.delayTendency.score;
  const completion = fingerprint.traits.completionReliability.score;

  const isLower = brainSnapshot.recommendedSession.focus === "Lower";
  const frictionPenalty = frictionProfile?.level === "high" ? 14 : frictionProfile?.level === "moderate" ? 7 : 0;
  const focusBase = isLower ? Math.round((split * 0.45) + (lower * 0.55)) : split;
  const predictedFocusMatchProbability = clamp(focusBase - Math.round(substitution * 0.18) - Math.round(delay * 0.12) - frictionPenalty, 20, 95);
  const predictedSubstitutionRisk = clamp(Math.round(substitution * 0.78 + (frictionProfile?.level === "high" ? 12 : frictionProfile?.level === "moderate" ? 6 : 0)), 5, 95);
  const predictedAnchorReliability = clamp(Math.round(anchor * 0.78 + completion * 0.12 - frictionPenalty * 0.5), 20, 95);

  const completionScore = Math.round(completion - frictionPenalty - Math.max(0, substitution - 40) * 0.25);
  const predictedCompletion: PredictionScaffold["predictedCompletion"] =
    completionScore >= 80 && predictedSubstitutionRisk <= 28
      ? "as_prescribed"
      : completionScore >= 58
        ? "modified"
        : "partial";

  const predictedDelayBucket: PredictionScaffold["predictedDelayBucket"] =
    delay >= 55 || frictionProfile?.signals.sessionGapDays != null && frictionProfile.signals.sessionGapDays >= 5
      ? "2_plus_days"
      : delay >= 30
        ? "1_day"
        : "same_day";

  const reasons: string[] = [];
  reasons.push(
    isLower
      ? `Lower-day prediction is leaning on split compliance ${split}/100 plus lower-day reliability ${lower}/100.`
      : `Focus-match prediction is leaning on split compliance ${split}/100.`
  );
  reasons.push(`Completion reliability ${completion}/100 and anchor loyalty ${anchor}/100 set the floor for how cleanly the session is expected to land.`);
  if (predictedSubstitutionRisk >= 40) {
    reasons.push(`Substitution tendency ${substitution}/100 says exact exercise identity should not be treated like gospel.`);
  }
  if (predictedDelayBucket !== "same_day") {
    reasons.push(`Delay tendency ${delay}/100 says this recommendation may age on the shelf before it gets used.`);
  }
  if (frictionProfile?.level && frictionProfile.level !== "low") {
    reasons.push(`Current friction is ${frictionProfile.level}, so prediction confidence is being trimmed before the app starts talking big.`);
  }
  if (latest.length >= 3) {
    const recentAvg = avg(latest.map((entry) => typeof entry.fidelityScore === "number" ? entry.fidelityScore : 60)) ?? 60;
    reasons.push(`Recent completed recommendation fidelity is averaging ${Math.round(recentAvg)}%, which is part of the prediction base rate.`);
  }

  const confidence = clamp(
    Math.round((fingerprint.confidence * 0.6) + (latest.length * 3) + (frictionProfile?.level === "high" ? -12 : frictionProfile?.level === "moderate" ? -6 : 2)),
    35,
    90,
  );

  return {
    generatedAt: new Date().toISOString(),
    confidence,
    predictedCompletion,
    predictedDelayBucket,
    predictedFocusMatchProbability,
    predictedSubstitutionRisk,
    predictedAnchorReliability,
    reasons: reasons.slice(0, 5),
  };
}

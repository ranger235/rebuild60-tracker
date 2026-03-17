// src/lib/sessionCoach.ts

export type RecommendationComparisonLite = {
  available: boolean;
  adherenceScore: number;
  focusAligned: boolean;
  recommendedFocus: string;
  actualFocus: string;
  matchedCount: number;
  totalRecommended: number;
  volumeDelta: number | null;
  loadDeltaAvg: number | null;
  substitutions: Array<{ recommended: string; actual: string }>;
  extras: string[];
  missed: string[];
  summary: string;
} | null;

export type CoachSessionExerciseSeedLite = {
  exerciseId: string;
  name: string;
  slot: string;
  sets: string;
  reps: string;
  load: string;
  loadBasis: string;
  note: string;
};

export type CoachSessionSeedLite = {
  sessionId: string;
  title: string;
  bias: string;
  summary: string;
  exercises: CoachSessionExerciseSeedLite[];
} | null;

export type SessionCoachInsights = {
  whyToday: string;
  mainFocus: string;
  progressionOpportunity: string;
  watchItem: string;
};

function niceSlot(slot: string | null | undefined): string {
  const raw = String(slot || "").trim();
  if (!raw) return "main work";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function firstExercise(seed: CoachSessionSeedLite): CoachSessionExerciseSeedLite | null {
  if (!seed?.exercises?.length) return null;
  return seed.exercises[0] || null;
}

function secondExercise(seed: CoachSessionSeedLite): CoachSessionExerciseSeedLite | null {
  if (!seed?.exercises?.length || seed.exercises.length < 2) return null;
  return seed.exercises[1] || null;
}

function buildWhyToday(
  seed: CoachSessionSeedLite,
  comparison: RecommendationComparisonLite
): string {
  if (seed?.summary?.trim()) {
    return seed.summary.trim();
  }

  if (comparison?.available) {
    if (!comparison.focusAligned) {
      return `This session brings focus back toward ${comparison.recommendedFocus.toLowerCase()} work after recent training drifted more toward ${comparison.actualFocus.toLowerCase()}.`;
    }
    if ((comparison.missed?.length || 0) > 0) {
      return `This session continues the current training rhythm while restoring work that was missed in the last recommendation.`;
    }
  }

  if (seed?.bias) {
    return `This session leans toward ${seed.bias.toLowerCase()} to keep the rebuild moving in balance.`;
  }

  return `This session continues your current training rhythm based on recent work and overall balance needs.`;
}

function buildMainFocus(
  seed: CoachSessionSeedLite,
  comparison: RecommendationComparisonLite
): string {
  const first = firstExercise(seed);
  const second = secondExercise(seed);

  if (first && second) {
    return `Prioritize ${first.name} first, then carry that standard into ${second.name}; the early work sets the tone for the session.`;
  }

  if (first) {
    return `Treat ${first.name} as the main work today and keep the rest of the session in support of it.`;
  }

  if (comparison?.available && comparison.recommendedFocus) {
    return `Keep the session centered on ${comparison.recommendedFocus.toLowerCase()} work and don’t let lower-value volume steal the day.`;
  }

  return `Prioritize the first primary movement and keep the rest of the session clean and consistent.`;
}

function buildProgressionOpportunity(
  seed: CoachSessionSeedLite,
  comparison: RecommendationComparisonLite
): string {
  const first = firstExercise(seed);
  if (first) {
    const slotLabel = niceSlot(first.slot).toLowerCase();
    return `If warm-ups feel solid, ${first.name} is the best place to look for a small win today through load, reps, or cleaner execution in the ${slotLabel}.`;
  }

  if (comparison?.available && comparison.loadDeltaAvg !== null && comparison.loadDeltaAvg < 0) {
    return `A clean return to recommended loading is the clearest progression opportunity today.`;
  }

  return `Look for a small improvement in the first major movement if warm-ups feel solid.`;
}

function buildWatchItem(
  seed: CoachSessionSeedLite,
  comparison: RecommendationComparisonLite
): string {
  if (comparison?.available) {
    if ((comparison.substitutions?.length || 0) > 0) {
      return `Keep exercise selection honest today; recent substitutions suggest the biggest win is staying closer to the intended structure.`;
    }
    if ((comparison.extras?.length || 0) > 0) {
      return `Don’t let extra work dilute the session; hit the planned work first and earn any additions after that.`;
    }
    if ((comparison.missed?.length || 0) > 0) {
      return `Execution matters more than variety today; finish the planned work before thinking about anything optional.`;
    }
    if (comparison.volumeDelta !== null && comparison.volumeDelta > 0.15) {
      return `Watch session creep today; recent work ran long, so keep accessories from stealing energy from the main work.`;
    }
    if (comparison.volumeDelta !== null && comparison.volumeDelta < -0.15) {
      return `Don’t undershoot the work today; the goal is to complete the planned volume cleanly and fully.`;
    }
  }

  const first = firstExercise(seed);
  if (first?.note?.trim()) {
    return first.note.trim();
  }

  return `Don’t let accessories steal energy from the main work.`;
}

export function buildSessionCoachInsights(args: {
  coachSessionSeed: CoachSessionSeedLite;
  recommendationComparison: RecommendationComparisonLite;
}): SessionCoachInsights | null {
  const { coachSessionSeed, recommendationComparison } = args;

  if (!coachSessionSeed && !recommendationComparison) return null;

  return {
    whyToday: buildWhyToday(coachSessionSeed, recommendationComparison),
    mainFocus: buildMainFocus(coachSessionSeed, recommendationComparison),
    progressionOpportunity: buildProgressionOpportunity(coachSessionSeed, recommendationComparison),
    watchItem: buildWatchItem(coachSessionSeed, recommendationComparison),
  };
}

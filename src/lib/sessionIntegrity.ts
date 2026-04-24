// src/lib/sessionIntegrity.ts

export type FeedbackExerciseLike = {
  id?: string | null;
  name?: string | null;
  sort_order?: number | null;
  [key: string]: unknown;
};

export type FeedbackSetLike = {
  id?: string | null;
  exercise_id?: string | null;
  set_number?: number | null;
  [key: string]: unknown;
};

export type FeedbackSessionPayload<TExercise extends FeedbackExerciseLike = FeedbackExerciseLike, TSet extends FeedbackSetLike = FeedbackSetLike> = {
  exercises?: TExercise[] | null;
  sets?: TSet[] | null;
  [key: string]: unknown;
};

function numericOrder(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function exerciseIdentityKey(exercise: FeedbackExerciseLike): string {
  const id = typeof exercise.id === "string" ? exercise.id.trim() : "";
  if (id) return `id:${id}`;

  const name = typeof exercise.name === "string" ? exercise.name.trim().toLowerCase() : "";
  const sort = Number.isFinite(Number(exercise.sort_order)) ? Number(exercise.sort_order) : "unknown";
  return `name:${name}|sort:${sort}`;
}

export function normalizeSessionForFeedback<T extends FeedbackSessionPayload>(session: T): T {
  if (!session) return session;

  const rawExercises = Array.isArray(session.exercises) ? session.exercises : [];
  const seenExercises = new Set<string>();
  const exercises = rawExercises
    .filter((ex): ex is NonNullable<typeof ex> => Boolean(ex && typeof ex === "object" && typeof ex.name === "string" && ex.name.trim()))
    .slice()
    .sort((a, b) => numericOrder(a.sort_order, rawExercises.indexOf(a)) - numericOrder(b.sort_order, rawExercises.indexOf(b)))
    .filter((ex) => {
      const key = exerciseIdentityKey(ex);
      if (seenExercises.has(key)) return false;
      seenExercises.add(key);
      return true;
    })
    .map((ex, i) => ({ ...ex, sort_order: i }));

  const validExerciseIds = new Set(
    exercises
      .map((ex) => (typeof ex.id === "string" ? ex.id : null))
      .filter((id): id is string => Boolean(id))
  );

  const rawSets = Array.isArray(session.sets) ? session.sets : [];
  const seenSets = new Set<string>();
  const sets = rawSets
    .filter((set): set is NonNullable<typeof set> => {
      if (!set || typeof set !== "object") return false;
      if (typeof set.exercise_id !== "string" || !set.exercise_id.trim()) return false;
      return validExerciseIds.has(set.exercise_id);
    })
    .slice()
    .sort((a, b) => {
      const exCompare = String(a.exercise_id).localeCompare(String(b.exercise_id));
      if (exCompare !== 0) return exCompare;
      return numericOrder(a.set_number, rawSets.indexOf(a)) - numericOrder(b.set_number, rawSets.indexOf(b));
    })
    .filter((set) => {
      const id = typeof set.id === "string" ? set.id.trim() : "";
      const key = id || `${set.exercise_id}|${set.set_number ?? "unknown"}`;
      if (seenSets.has(key)) return false;
      seenSets.add(key);
      return true;
    });

  return {
    ...session,
    exercises,
    sets,
  };
}

export function normalizeWorkoutForFeedback<TExercise extends FeedbackExerciseLike, TSet extends FeedbackSetLike>(
  exercises: TExercise[] | null | undefined,
  sets: TSet[] | null | undefined
): { exercises: TExercise[]; sets: TSet[] } {
  const normalized = normalizeSessionForFeedback({ exercises: exercises ?? [], sets: sets ?? [] });
  return {
    exercises: normalized.exercises as TExercise[],
    sets: normalized.sets as TSet[],
  };
}

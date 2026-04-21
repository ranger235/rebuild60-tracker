import { emptyExerciseControl, type ExerciseControlRec } from "./exerciseControl";
import { getCanonicalExerciseIdentity, type ExerciseIdentityInput } from "./exerciseIdentity";

export type ExerciseControlKind = "prefer" | "avoid" | "never" | "injury";

export type ExerciseControlLookupInput = string | ExerciseIdentityInput | null | undefined;

export type ExerciseControlsDeps = {
  userId: string | null | undefined;
  exerciseControlRows: ExerciseControlRec[];
  getByKey: (key: [string, string]) => Promise<ExerciseControlRec | undefined>;
  put: (row: ExerciseControlRec) => Promise<unknown>;
  refresh: () => Promise<unknown>;
  refreshDashboard?: () => Promise<unknown>;
};

export function resolveExerciseControlLibraryId(input: ExerciseControlLookupInput): string | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed || null;
  }
  const identity = getCanonicalExerciseIdentity(input);
  return identity.exerciseLibraryId ?? null;
}

export function getExerciseControlRecord(
  input: ExerciseControlLookupInput,
  exerciseControlRows: ExerciseControlRec[]
): ExerciseControlRec | null {
  const exerciseLibraryId = resolveExerciseControlLibraryId(input);
  if (!exerciseLibraryId) return null;
  return exerciseControlRows.find((row) => row.exercise_library_id === exerciseLibraryId) ?? null;
}

export async function setExerciseControlRecord(
  input: ExerciseControlLookupInput,
  control: ExerciseControlKind,
  deps: ExerciseControlsDeps
): Promise<void> {
  const uid = deps.userId ?? null;
  const exerciseLibraryId = resolveExerciseControlLibraryId(input);
  if (!uid || !exerciseLibraryId) return;

  const key: [string, string] = [uid, exerciseLibraryId];
  const current = (await deps.getByKey(key)) ?? emptyExerciseControl(uid, exerciseLibraryId);

  if (control === "injury") {
    current.injury = !current.injury;
  } else {
    const nextValue = !current[control];
    current.prefer = false;
    current.avoid = false;
    current.never = false;
    current[control] = nextValue;
  }

  current.updated_at = new Date().toISOString();
  await deps.put(current);
  await deps.refresh();
  if (deps.refreshDashboard) await deps.refreshDashboard();
}

import { canonicalExerciseName, resolveExerciseKey } from "./exerciseCompat";
import { getExerciseById, getExerciseByKey } from "./exerciseRegistry";

export type ExerciseIdentityInput = {
  name?: string | null;
  exercise_library_id?: string | null;
  exercise_family_id?: string | null;
};

export type ResolvedExerciseIdentity = {
  canonicalName: string;
  stableKey: string;
  exerciseLibraryId: string | null;
  exerciseFamilyId: string | null;
  normalizedName: string;
  source: "row" | "library_match" | "alias" | "fallback" | "unresolved";
};

function normalizeName(raw: string | null | undefined): string {
  return String(raw || "").trim();
}

export function resolveExerciseIdentityFromName(raw: string): ResolvedExerciseIdentity {
  const normalizedName = normalizeName(raw);
  const canonicalName = canonicalExerciseName(normalizedName);
  const stableKey = resolveExerciseKey(normalizedName) || "";
  const registryExercise = stableKey ? getExerciseByKey(stableKey) : null;
  return {
    canonicalName,
    stableKey,
    exerciseLibraryId: registryExercise?.id ?? (stableKey || null),
    exerciseFamilyId: registryExercise?.family ?? null,
    normalizedName,
    source: registryExercise
      ? canonicalName === normalizedName
        ? "library_match"
        : "alias"
      : stableKey
      ? "fallback"
      : "unresolved",
  };
}

export function resolveExerciseIdentityFromRow(input: ExerciseIdentityInput | null | undefined): ResolvedExerciseIdentity {
  const normalizedName = normalizeName(input?.name);
  const libraryId = normalizeName(input?.exercise_library_id);
  const familyId = normalizeName(input?.exercise_family_id) || null;

  if (libraryId) {
    const registryExercise = getExerciseById(libraryId);
    const stableKey = registryExercise?.key ?? (resolveExerciseKey(normalizedName) || libraryId);
    const canonicalName = registryExercise?.canonicalName ?? canonicalExerciseName(normalizedName || libraryId);
    return {
      canonicalName,
      stableKey,
      exerciseLibraryId: libraryId,
      exerciseFamilyId: registryExercise?.family ?? familyId,
      normalizedName,
      source: "row",
    };
  }

  return resolveExerciseIdentityFromName(normalizedName);
}

export function getCanonicalExerciseIdentity(input: string | ExerciseIdentityInput | null | undefined): ResolvedExerciseIdentity {
  if (typeof input === "string") return resolveExerciseIdentityFromName(input);
  return resolveExerciseIdentityFromRow(input);
}

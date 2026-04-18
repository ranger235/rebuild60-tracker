import { getExerciseByKey, resolveExerciseAlias } from "./exerciseRegistry";

function normalize(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeExerciseInput(input: string): string {
  return normalize(input);
}

export function resolveExerciseKey(input: string): string {
  const normalized = normalize(input);
  if (!normalized) return normalized;
  const aliasHit = resolveExerciseAlias(normalized);
  if (aliasHit) return aliasHit;
  const direct = getExerciseByKey(normalized);
  if (direct) return direct.key;
  return normalized;
}

export function canonicalExerciseName(input: string): string {
  const key = resolveExerciseKey(input);
  const found = getExerciseByKey(key);
  return found?.canonicalName ?? String(input || "").trim();
}

export function isKnownExerciseKey(input: string): boolean {
  const key = resolveExerciseKey(input);
  return !!getExerciseByKey(key);
}

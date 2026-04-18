import { getExerciseByKey, resolveExerciseAlias } from "./exerciseRegistry";

function normalizeInput(input: string): string {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[_\-]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactInput(input: string): string {
  return normalizeInput(input).replace(/\s+/g, "");
}

export function resolveExerciseKey(input: string): string {
  const compact = compactInput(input);
  const aliasHit = resolveExerciseAlias(compact);
  if (aliasHit) return aliasHit;

  const normalized = normalizeInput(input).replace(/\s+/g, "_");
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

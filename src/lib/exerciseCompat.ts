import { getAllExercises, getExerciseByKey, resolveExerciseAlias } from "./exerciseRegistry";

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

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );

      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }

  return dp[a.length][b.length];
}

function fuzzyResolveExerciseKey(normalized: string): string | null {
  if (!normalized || normalized.length < 6) return null;

  let bestKey: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let tie = false;

  for (const exercise of getAllExercises()) {
    for (const alias of exercise.aliases) {
      const lengthGap = Math.abs(alias.length - normalized.length);
      if (lengthGap > 1) continue;

      const distance = levenshteinDistance(normalized, alias);
      if (distance > 1) continue;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestKey = exercise.key;
        tie = false;
      } else if (distance === bestDistance && bestKey !== exercise.key) {
        tie = true;
      }
    }
  }

  if (bestDistance <= 1 && !tie) return bestKey;
  return null;
}

export function resolveExerciseKey(input: string): string {
  const normalized = normalize(input);
  if (!normalized) return normalized;
  const aliasHit = resolveExerciseAlias(normalized);
  if (aliasHit) return aliasHit;
  const direct = getExerciseByKey(normalized);
  if (direct) return direct.key;
  const fuzzyHit = fuzzyResolveExerciseKey(normalized);
  if (fuzzyHit) return fuzzyHit;
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


import type { PrefMem } from "./exercisePreferenceMemory";

function safeRate(a: number, b: number) {
  if (!b || b <= 0) return 0;
  return a / b;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function getPreferenceMultiplier(mem?: PrefMem | null) {
  if (!mem) return 1;

  const pos =
    0.45 * safeRate(mem.accepted_count, Math.max(1, mem.recommended_count)) +
    0.75 * safeRate(mem.completed_count, Math.max(1, mem.accepted_count || mem.recommended_count)) +
    0.35 * Math.min(mem.manually_added_count / 6, 1) +
    0.2 * safeRate(mem.swapped_in_count, Math.max(1, mem.recommended_count));

  const neg =
    0.8 * safeRate(mem.removed_count, Math.max(1, mem.recommended_count)) +
    0.6 * safeRate(mem.swapped_out_count, Math.max(1, mem.recommended_count));

  const raw = 1 + clamp(pos - neg, -0.18, 0.18);
  return clamp(raw, 0.82, 1.18);
}

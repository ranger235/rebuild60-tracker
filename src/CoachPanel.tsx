import React from "react";
import type { LocalWorkoutSet } from "./localdb";

type Props = {
  exerciseName: string;
  sets: LocalWorkoutSet[];
  compound: boolean;
  onApplyTarget?: (target: CoachTarget) => void;
};

type CoachTarget = {
  loadType: "weight" | "bodyweight" | "band";
  weightLbs?: number | null;
  reps?: number | null;
  // bands
  bandLevel?: number | null;
  bandMode?: "assist" | "resist" | null;
  bandConfig?: "single" | "doubled" | null;
  bandEstLbs?: number | null;
};

function epley1RM(load: number, reps: number): number {
  return load * (1 + reps / 30);
}

function bestWorkSet(sets: LocalWorkoutSet[]): { load: number; reps: number; rpe?: number | null; loadType: "weight" | "bodyweight" | "band"; bandLevel?: number | null; bandMode?: "assist" | "resist" | null; bandConfig?: "single" | "doubled" | null; bandEstLbs?: number | null } | null {
  // Exclude warmups and any sets without reps/load.
  const work = (sets ?? []).filter((s) => !s.is_warmup);

  let best: { s: LocalWorkoutSet; load: number; reps: number; rpe?: number | null; score: number } | null = null;

  for (const s of work) {
    const reps = typeof s.reps === "number" ? s.reps : null;
    if (!reps || reps <= 0) continue;

    // Determine effective load
    let load: number | null = null;

    const lt = (s.load_type ?? "weight") as string;

    if (lt === "band") {
      if (typeof s.band_est_lbs === "number") load = s.band_est_lbs;
      else if (typeof s.weight_lbs === "number") load = s.weight_lbs; // fallback
    } else {
      if (typeof s.weight_lbs === "number") load = s.weight_lbs;
      else if (typeof s.band_est_lbs === "number") load = s.band_est_lbs; // fallback
    }

    if (load == null || !isFinite(load) || load <= 0) continue;

    const score = epley1RM(load, reps);
    if (!best || score > best.score) best = { s, load, reps, rpe: s.rpe ?? null, score };
  }

  if (!best) return null;
  const lt = ((best.s.load_type ?? "weight") as string);
  const loadType: "weight" | "bodyweight" | "band" = lt === "band" ? "band" : (lt === "bodyweight" ? "bodyweight" : "weight");
  return {
    load: best.load,
    reps: best.reps,
    rpe: best.rpe,
    loadType,
    bandLevel: (best.s.band_level as any) ?? null,
    bandMode: (best.s.band_mode as any) ?? null,
    bandConfig: (best.s.band_config as any) ?? null,
    bandEstLbs: (best.s.band_est_lbs as any) ?? null
  };
}

function suggest(compound: boolean, load: number, reps: number, rpe?: number | null): string {
  // Simple, stable v1 rules (no history yet; that comes next).
  // Compounds: conservative load bumps. Accessories: reps-first.
  if (compound) {
    // If we have RPE and it's high, hold.
    if (typeof rpe === "number" && rpe >= 9) return "Hold weight next time (RPE high).";
    if (reps >= 6) return "Earned it: +5 lbs next time.";
    if (reps >= 4) return "Hold weight, aim +1 rep next time.";
    return "Back-off: reduce load 2.5–5% and rebuild reps.";
  }

  // Accessories
  if (reps >= 15) return "Small load bump (+2.5–5 lbs) next time.";
  if (reps >= 10) return "Add 1–2 reps next time (reps-first).";
  return "Same load, build reps into the 10–15 range.";
}


function buildTarget(compound: boolean, best: { load: number; reps: number; rpe?: number | null; loadType: "weight" | "bodyweight" | "band"; bandLevel?: number | null; bandMode?: "assist" | "resist" | null; bandConfig?: "single" | "doubled" | null; bandEstLbs?: number | null }): CoachTarget {
  const { load, reps, rpe, loadType } = best;

  // Default: keep same load type and progress reps modestly.
  if (loadType === "bodyweight") {
    const nextReps = reps >= 15 ? reps : Math.min(15, reps + 1);
    return { loadType: "bodyweight", reps: nextReps };
  }

  if (loadType === "band") {
    const level = best.bandLevel ?? 3;
    const mode = best.bandMode ?? "resist";
    const cfg = best.bandConfig ?? "single";

    if (mode === "assist") {
      // Assistance: keep reps, reduce assistance slowly when you're owning the reps.
      const nextLevel = reps >= 8 ? Math.max(1, level - 1) : level;
      return { loadType: "band", bandMode: "assist", bandLevel: nextLevel, bandConfig: cfg, reps };
    }

    // Resist: reps-first then level.
    if (reps >= 15) {
      const nextLevel = Math.min(5, level + 1);
      return { loadType: "band", bandMode: "resist", bandLevel: nextLevel, bandConfig: cfg, reps: 10 };
    }
    const nextReps = Math.min(15, reps + 1);
    return { loadType: "band", bandMode: "resist", bandLevel: level, bandConfig: cfg, reps: nextReps };
  }

  // Weight-based
  if (compound) {
    if (typeof rpe === "number" && rpe >= 9) {
      // High effort: hold and add a rep if possible.
      return { loadType: "weight", weightLbs: load, reps: Math.min(reps + 1, 6) };
    }
    if (reps >= 6) return { loadType: "weight", weightLbs: load + 5, reps: 5 };
    if (reps >= 4) return { loadType: "weight", weightLbs: load, reps: reps + 1 };
    // Backoff a bit
    return { loadType: "weight", weightLbs: Math.round(load * 0.95 / 5) * 5, reps: reps };
  }

  // Accessories
  if (reps >= 15) return { loadType: "weight", weightLbs: load + 5, reps: 10 };
  if (reps >= 10) return { loadType: "weight", weightLbs: load, reps: Math.min(15, reps + 2) };
  return { loadType: "weight", weightLbs: load, reps: Math.min(12, reps + 2) };
}

export function CoachPanel({ exerciseName, sets, compound, onApplyTarget }: Props) {
  try {
    const best = bestWorkSet(sets ?? []);
    if (!best) return null;

    const est = epley1RM(best.load, best.reps);
    const msg = suggest(compound, best.load, best.reps, best.rpe);

    return (
      <div
        style={{
          marginTop: 10,
          padding: 10,
          border: "1px solid #eee",
          borderRadius: 10,
          background: "#fafafa",
          fontSize: 13
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Coach</div>
        <div style={{ opacity: 0.9 }}>
          Best work set: <b>{best.load.toFixed(0)}</b> × <b>{best.reps}</b>
          {best.rpe != null ? ` @RPE ${best.rpe}` : ""}
        </div>
        <div style={{ opacity: 0.8 }}>Est. 1RM: {est.toFixed(0)}</div>
        <div style={{ marginTop: 6 }}>{msg}</div>

        {typeof onApplyTarget === "function" && (
          <button
            style={{ marginTop: 8, padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 700 }}
            onClick={() => {
              const t = buildTarget(compound, best as any);
              onApplyTarget(t);
            }}
          >
            Apply Next Target
          </button>
        )}

        {/* tiny transparency to help debugging */}
        <div style={{ marginTop: 6, opacity: 0.55, fontSize: 12 }}>
          ({exerciseName})
        </div>
      </div>
    );
  } catch (e) {
    // Never take down the page.
    // eslint-disable-next-line no-console
    console.error("CoachPanel render error:", e);
    return (
      <div style={{ marginTop: 10, padding: 10, border: "1px solid #eee", borderRadius: 10, background: "#fff6f6", fontSize: 13 }}>
        Coach panel had an error (logging still works).
      </div>
    );
  }
}

type BoundaryProps = Props;

type BoundaryState = { hasError: boolean };

export class CoachBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error("CoachBoundary caught:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #eee", borderRadius: 10, background: "#fff6f6", fontSize: 13 }}>
          Coach panel crashed (logging still works).
        </div>
      );
    }
    return <CoachPanel {...this.props} />;
  }
}


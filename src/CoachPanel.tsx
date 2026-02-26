import React from "react";
import { localdb, type LocalWorkoutExercise, type LocalWorkoutSet, type LoadType } from "./localdb";

type Props = {
  userId: string;
  dayDate: string;
  exercise: LocalWorkoutExercise;
  sets: LocalWorkoutSet[];
  advanced: boolean;
  bandDefaults: Record<number, number>;
};

type BestSet = {
  load_type: LoadType;
  weight_lbs: number | null;
  band_level: number | null;
  band_est_lbs: number | null;
  reps: number;
  rpe: number | null;
};

type HistoryPoint = {
  day_date: string;
  started_at: string;
  bestSet: BestSet;
  e1rm: number;
};

function epleyE1RM(load: number, reps: number) {
  return load * (1 + reps / 30);
}

function effectiveLoadLbs(s: BestSet): number | null {
  if (s.load_type === "weight") return s.weight_lbs ?? null;
  if (s.load_type === "band") return s.band_est_lbs ?? null;
  return null; // bodyweight: unknown
}

function pickBestWorkSet(sets: LocalWorkoutSet[], bandDefaults: Record<number, number>): BestSet | null {
  const work = sets
    .filter((s) => !s.is_warmup)
    .filter((s) => (s.reps ?? 0) > 0);

  if (work.length === 0) return null;

  let best: BestSet | null = null;

  for (const s of work) {
    const load_type: LoadType = (s.load_type as LoadType) ?? "weight";
    const reps = Number(s.reps ?? 0);
    if (!reps) continue;

    const band_level = s.band_level ?? null;
    const band_est_lbs =
      load_type === "band" ? (s.band_est_lbs ?? (band_level ? bandDefaults[band_level] ?? null : null)) : null;

    const cand: BestSet = {
      load_type,
      weight_lbs: load_type === "weight" ? (s.weight_lbs ?? null) : null,
      band_level,
      band_est_lbs,
      reps,
      rpe: s.rpe ?? null
    };

    const load = effectiveLoadLbs(cand) ?? -1;
    const score = load * 1000 + reps; // prefer load, then reps

    if (!best) {
      best = cand;
    } else {
      const bestLoad = effectiveLoadLbs(best) ?? -1;
      const bestScore = bestLoad * 1000 + best.reps;
      if (score > bestScore) best = cand;
    }
  }

  return best;
}

function isLikelyCompound(ex: LocalWorkoutExercise): boolean {
  if (ex.is_compound === true) return true;
  const n = ex.name.toLowerCase();
  const keys = ["squat", "bench", "deadlift", "press", "row", "chin", "pull", "dip", "rdl", "lunge"];
  return keys.some((k) => n.includes(k));
}

async function loadHistory(
  userId: string,
  exerciseName: string,
  limit: number,
  bandDefaults: Record<number, number>
): Promise<HistoryPoint[]> {
  const sessions = await localdb.localSessions.where({ user_id: userId }).toArray();
  sessions.sort((a, b) =>
    a.day_date < b.day_date ? 1 : a.day_date > b.day_date ? -1 : b.started_at.localeCompare(a.started_at)
  );

  const points: HistoryPoint[] = [];

  for (const sess of sessions) {
    if (sess.exclude_from_analytics) continue;

    const exs = await localdb.localExercises.where({ session_id: sess.id }).toArray();
    const match = exs.find((e) => e.name === exerciseName);
    if (!match) continue;

    const sets = await localdb.localSets.where({ exercise_id: match.id }).toArray();
    const best = pickBestWorkSet(sets, bandDefaults);
    if (!best) continue;

    const load = effectiveLoadLbs(best);
    if (load == null) continue;

    points.push({
      day_date: sess.day_date,
      started_at: sess.started_at,
      bestSet: best,
      e1rm: epleyE1RM(load, best.reps)
    });

    if (points.length >= limit) break;
  }

  return points;
}

function formatBestSet(s: BestSet) {
  if (s.load_type === "band") {
    const lvl = s.band_level ?? "?";
    const est = s.band_est_lbs != null ? ` (~${Math.round(s.band_est_lbs)}lb)` : "";
    return `Band ${lvl}${est} x ${s.reps}`;
  }
  if (s.load_type === "bodyweight") return `BW x ${s.reps}`;
  const w = s.weight_lbs ?? 0;
  return `${w} x ${s.reps}`;
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return ((a - b) / b) * 100;
}

function coachSuggestion(kind: "compound" | "accessory", hist: HistoryPoint[]) {
  if (hist.length === 0) {
    return { headline: "No history yet", detail: "Log a couple sessions and I’ll start making suggestions." };
  }

  const last = hist[0];
  const prev = hist[1] ?? null;
  const lastRpe = last.bestSet.rpe;

  // Deload: 3-session downtrend (>1% each)
  if (kind === "compound" && hist.length >= 3) {
    const a = hist[0].e1rm;
    const b = hist[1].e1rm;
    const c = hist[2].e1rm;
    if (a && b && c && a < b * 0.99 && b < c * 0.99) {
      return {
        headline: "Consider a small deload (-5%)",
        detail: "e1RM has dropped 3 sessions in a row. That’s usually fatigue, not weakness."
      };
    }
  }

  if (!prev) {
    return kind === "accessory"
      ? { headline: "Add reps next time", detail: "Accessories respond best to reps-first progression." }
      : { headline: "Hold steady", detail: "Get one more session logged for this lift and I’ll start trend-based calls." };
  }

  const change = pct(last.e1rm, prev.e1rm);

  if (kind === "compound") {
    if (lastRpe != null && lastRpe >= 9) {
      return {
        headline: "Hold weight next time",
        detail: `Last top work set was heavy (@${lastRpe}). Earn the reps before adding load.`
      };
    }
    if (change >= 1.0 && (lastRpe == null || lastRpe <= 8)) {
      return { headline: "Add +5 lbs next time", detail: `Trend up (+${change.toFixed(1)}%). Conservative bump.` };
    }
    if (change <= -1.0) {
      return { headline: "Hold (or micro-load)", detail: `Trend down (${change.toFixed(1)}%). Sleep/food/fatigue check.` };
    }
    return { headline: "Hold weight", detail: `Trend flat (${change.toFixed(1)}%). Repeat and tighten execution.` };
  }

  // accessory (aggressive)
  const reps = last.bestSet.reps;

  if (lastRpe != null && lastRpe >= 9) {
    return { headline: "Hold — clean reps", detail: `Near limit (@${lastRpe}). Keep load and make reps cleaner.` };
  }
  if (reps < 10) return { headline: "Add +1–2 reps next time", detail: "Reps-first, then load." };
  if (reps < 15) return { headline: "Add reps or small load", detail: "If you’re at 12–15 clean, bump load slightly." };
  return { headline: "Increase load slightly (+2.5–5 lbs)", detail: "You’re living in high reps—time to nudge load up." };
}

class CoachPanelBoundary extends React.Component<Props, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: any) {
    // eslint-disable-next-line no-console
    console.error("CoachPanel crashed:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ border: "1px solid #f2c2c2", borderRadius: 10, padding: 10, background: "#fff5f5" }}>
          <b>Coach</b>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            Coach panel hit an error (logging still works). Toggle Coach off and send me what you were doing.
          </div>
        </div>
      );
    }
    return <CoachPanelInner {...this.props} />;
  }
}

function CoachPanelInner({ userId, exercise, bandDefaults }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [hist, setHist] = React.useState<HistoryPoint[] | null>(null);

  const kind: "compound" | "accessory" = isLikelyCompound(exercise) ? "compound" : "accessory";

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true);
        const h = await loadHistory(userId, exercise.name, 6, bandDefaults);
        if (!alive) return;
        setHist(h);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Coach history load failed:", e);
        if (alive) setHist([]);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, exercise.name, bandDefaults]);

  const suggestion = coachSuggestion(kind, hist ?? []);
  const last = hist && hist[0] ? hist[0] : null;
  const prev = hist && hist[1] ? hist[1] : null;
  const change = last && prev ? pct(last.e1rm, prev.e1rm) : null;

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Coach</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {busy ? "Thinking…" : kind === "compound" ? "Compound (conservative)" : "Accessory (aggressive)"}
        </div>
      </div>

      {last ? (
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
          <b>Last:</b> {formatBestSet(last.bestSet)} • <b>e1RM</b> {Math.round(last.e1rm)}
          {change != null ? (
            <>
              {" "}
              • <b>Trend</b> {change >= 0 ? "+" : ""}
              {change.toFixed(1)}%
            </>
          ) : null}
        </div>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
          No prior work sets found locally for this exercise yet.
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 800 }}>{suggestion.headline}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4, lineHeight: 1.35 }}>{suggestion.detail}</div>
      </div>
    </div>
  );
}

export function CoachPanel(props: Props) {
  return <CoachPanelBoundary {...props} />;
}

import React, { useEffect, useMemo, useState } from "react";
import { localdb, type LocalWorkoutSet } from "./localdb";

type Props = {
  userId: string;
  dayDate: string;
  exerciseName: string;
  isCompound: boolean;
};

type HistoryPoint = {
  day_date: string;
  started_at: string;
  bestSet: LocalWorkoutSet;
  e1rm: number;
};

function epleyE1RM(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

function pickBestWorkSet(sets: LocalWorkoutSet[]): { best: LocalWorkoutSet; e1rm: number } | null {
  const work = sets.filter((s) => !s.is_warmup && s.weight_lbs != null && s.reps != null);
  if (work.length === 0) return null;

  let best = work[0];
  let bestE = epleyE1RM(Number(best.weight_lbs), Number(best.reps));
  for (const s of work.slice(1)) {
    const e = epleyE1RM(Number(s.weight_lbs), Number(s.reps));
    if (e > bestE) {
      best = s;
      bestE = e;
    }
  }
  return { best, e1rm: bestE };
}

function fmtSet(s: LocalWorkoutSet) {
  const w = s.weight_lbs ?? "";
  const r = s.reps ?? "";
  const rpe = s.rpe != null ? ` @${s.rpe}` : "";
  const wu = s.is_warmup ? " (WU)" : "";
  return `${w} x ${r}${rpe}${wu}`;
}

function pct(a: number, b: number) {
  if (!isFinite(a) || !isFinite(b) || b === 0) return 0;
  return ((a - b) / b) * 100;
}

function suggestionFor(isCompound: boolean, recent: HistoryPoint[]) {
  const newest = recent[0];
  const prev = recent[1];

  if (!newest || !prev) {
    return { headline: "Coach", detail: "Log a couple sessions for this exercise to unlock suggestions." };
  }

  const trend = pct(newest.e1rm, prev.e1rm);
  const rpe = newest.bestSet.rpe;

  if (isCompound) {
    const rpeOk = rpe == null ? trend > 0.5 : rpe <= 8;
    if (trend >= 1 && rpeOk) return { headline: "Suggestion: +5 lbs next time", detail: `e1RM up ${trend.toFixed(1)}% vs last time.` };
    if (trend <= -1.5) {
      if (recent.length >= 3) {
        const older = recent[2];
        const t1 = pct(newest.e1rm, prev.e1rm);
        const t2 = pct(prev.e1rm, older.e1rm);
        if (t1 < 0 && t2 < 0) return { headline: "Suggestion: consider a small deload (-5%)", detail: "Two consecutive drops. If you also feel beat up, back off and rebuild momentum." };
      }
      return { headline: "Suggestion: hold weight", detail: "Performance dipped. Keep it tight and earn the next jump." };
    }
    return { headline: "Suggestion: hold weight", detail: `Trend ${trend.toFixed(1)}%. Push when it’s obvious.` };
  }

  const reps = newest.bestSet.reps ?? 0;
  if (reps >= 12) return { headline: "Suggestion: small load bump (+2.5–5 lbs)", detail: "You’re living in the high reps—nudge load up." };
  return { headline: "Suggestion: add 1–2 reps next time", detail: "Chase reps first on accessories, then increase load." };
}

function PanelInner({ userId, dayDate, exerciseName, isCompound }: Props) {
  const [recent, setRecent] = useState<HistoryPoint[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);

        const sessions = await localdb.localSessions.where({ user_id: userId }).toArray();
        sessions.sort((a, b) =>
          a.day_date < b.day_date ? 1 : a.day_date > b.day_date ? -1 : b.started_at.localeCompare(a.started_at)
        );

        const points: HistoryPoint[] = [];
        for (const sess of sessions) {
          const exs = await localdb.localExercises.where({ session_id: sess.id }).toArray();
          const match = exs.find((e) => e.name === exerciseName);
          if (!match) continue;

          const sets = await localdb.localSets.where({ exercise_id: match.id }).toArray();
          const best = pickBestWorkSet(sets);
          if (!best) continue;

          points.push({ day_date: sess.day_date, started_at: sess.started_at, bestSet: best.best, e1rm: best.e1rm });
          if (points.length >= 3) break;
        }

        if (alive) setRecent(points.length ? points : []);
      } catch (e: any) {
        if (alive) setErr(e?.message ? String(e.message) : String(e));
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId, dayDate, exerciseName]);

  const suggestion = useMemo(() => suggestionFor(isCompound, recent ?? []), [isCompound, recent]);

  if (err) {
    return (
      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #f3c2c2", background: "#fff5f5" }}>
        <div style={{ fontWeight: 800 }}>Coach panel error</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{err}</div>
      </div>
    );
  }

  if (!recent) {
    return (
      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #eee", background: "#fafafa", fontSize: 12, opacity: 0.8 }}>
        Coach: loading…
      </div>
    );
  }

  const newest = recent[0];
  const prev = recent[1];

  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #eee", background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 800 }}>Coach</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>{isCompound ? "Compound (conservative)" : "Accessory (aggressive)"}</div>
      </div>

      {newest ? (
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6, lineHeight: 1.4 }}>
          <div>
            <b>Best recent:</b> {fmtSet(newest.bestSet)} · e1RM {Math.round(newest.e1rm)}
          </div>
          {prev ? (
            <div style={{ opacity: 0.85 }}>
              <b>Prev:</b> e1RM {Math.round(prev.e1rm)} ({pct(newest.e1rm, prev.e1rm).toFixed(1)}%)
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>No prior work sets found locally for this exercise yet.</div>
      )}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 800 }}>{suggestion.headline}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4, lineHeight: 1.35 }}>{suggestion.detail}</div>
      </div>
    </div>
  );
}

export function CoachPanel(props: Props) {
  try {
    return <PanelInner {...props} />;
  } catch (e: any) {
    return (
      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #f3c2c2", background: "#fff5f5" }}>
        <div style={{ fontWeight: 800 }}>Coach panel error</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{e?.message ? String(e.message) : String(e)}</div>
      </div>
    );
  }
}


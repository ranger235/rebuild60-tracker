import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { enqueue, startAutoSync } from "./sync";
import {
  localdb,
  type LocalWorkoutExercise,
  type LocalWorkoutSession,
  type LocalWorkoutSet,
  type LocalWorkoutTemplate,
  type LocalWorkoutTemplateExercise
} from "./localdb";

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function uuid(): string {
  return crypto.randomUUID();
}

function oneRmEpley(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30));
}

function isoToDay(iso: string): string {
  // best-effort: ISO string -> YYYY-MM-DD
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return iso.slice(0, 10);
  }
}

type SetLite = {
  weight_lbs: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
};

type LastSetSummary = {
  source: "local" | "cloud";
  started_at: string;
  sets: SetLite[];
};

type CoachRec = {
  label: "ADD_WEIGHT" | "ADD_REPS" | "HOLD" | "DELOAD";
  headline: string;
  detail: string;
  deltaPct?: number | null;
  lastTop?: { weight: number; reps: number; rpe: number | null; e1rm: number } | null;
  prevTop?: { weight: number; reps: number; rpe: number | null; e1rm: number } | null;
};

type ExerciseDraft = {
  weight: string;
  reps: string;
  rpe: string;
  warmup: boolean;
};

function formatSet(s: SetLite) {
  const w = s.weight_lbs ?? "—";
  const r = s.reps ?? "—";
  const wu = s.is_warmup ? "WU" : "";
  const rpe = s.rpe != null ? `@${s.rpe}` : "";
  return `${w}x${r}${wu}${rpe}`;
}

function isCompoundExercise(name: string): boolean {
  const n = name.toLowerCase();

  const compoundKeywords = [
    "squat",
    "bench",
    "deadlift",
    "press",
    "overhead",
    "ohp",
    "row",
    "pull-up",
    "pull up",
    "chin-up",
    "chin up",
    "dip",
    "lunge",
    "split squat",
    "rdl",
    "romanian",
    "good morning",
    "hack squat",
    "leg press",
    "incline bench"
  ];

  const accessoryKeywords = [
    "curl",
    "extension",
    "fly",
    "lateral",
    "raise",
    "tricep",
    "pushdown",
    "pulldown",
    "face pull",
    "rear delt",
    "calf",
    "hamstring curl",
    "leg curl",
    "pec deck",
    "cable",
    "machine fly",
    "shrug",
    "abs",
    "crunch",
    "plank"
  ];

  if (accessoryKeywords.some((k) => n.includes(k))) return false;
  return compoundKeywords.some((k) => n.includes(k));
}

type BackupEnvelope = {
  app: "rebuild60";
  schema: number;
  exported_at: string;
  tables: Record<string, any[]>;
};

// -----------------------------
// Simple SVG sparkline / line chart
// -----------------------------
function LineChart({
  title,
  points,
  height = 120
}: {
  title: string;
  points: { xLabel: string; y: number }[];
  height?: number;
}) {
  const width = 340;
  const pad = 18;

  if (!points || points.length === 0) {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>No data yet.</div>
      </div>
    );
  }

  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || 1;

  const toX = (i: number) => {
    if (points.length === 1) return pad;
    return pad + (i * (width - pad * 2)) / (points.length - 1);
  };
  const toY = (y: number) => {
    const t = (y - minY) / span; // 0..1
    return pad + (1 - t) * (height - pad * 2);
  };

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.y).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1]?.y ?? 0;

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Latest: <b>{Number.isFinite(last) ? Math.round(last) : last}</b>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ marginTop: 8 }}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
        {/* min/max labels */}
        <text x={pad} y={pad - 4} fontSize="10" opacity="0.65">
          {Math.round(maxY)}
        </text>
        <text x={pad} y={height - 4} fontSize="10" opacity="0.65">
          {Math.round(minY)}
        </text>
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.75 }}>
        <span>{points[0]?.xLabel}</span>
        <span>{points[points.length - 1]?.xLabel}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("…");
  const [tab, setTab] = useState<"quick" | "workout" | "dash">("quick");

  // Auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  // Date
  const dayDate = useMemo(() => todayISO(), []);

  // Quick Log
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [z2Minutes, setZ2Minutes] = useState("");
  const [notes, setNotes] = useState("");

  // Rest timer
  const [timerOn, setTimerOn] = useState(false);
  const [secs, setSecs] = useState(90);

  // Workout: local-first state
  const [sessions, setSessions] = useState<LocalWorkoutSession[]>([]);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<LocalWorkoutExercise[]>([]);
  const [sets, setSets] = useState<LocalWorkoutSet[]>([]);

  // Workout UI
  const [newExerciseName, setNewExerciseName] = useState("");
  const [advanced, setAdvanced] = useState(false);

  // Per-exercise drafts
  const [draftByExerciseId, setDraftByExerciseId] = useState<Record<string, ExerciseDraft>>({});

  // Templates
  const [templates, setTemplates] = useState<LocalWorkoutTemplate[]>([]);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [templateExercises, setTemplateExercises] = useState<LocalWorkoutTemplateExercise[]>([]);

  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [newTemplateExerciseName, setNewTemplateExerciseName] = useState("");

  // Last numbers cache
  const [lastByExerciseName, setLastByExerciseName] = useState<Record<string, LastSetSummary | undefined>>({});

  // Coach suggestions cache (computed from local history)
  const [coachByExerciseName, setCoachByExerciseName] = useState<Record<string, CoachRec | undefined>>({});
  const [coachBusy, setCoachBusy] = useState(false);

  // Backup/Restore
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  // Dashboard computed series
  const [dashBusy, setDashBusy] = useState(false);
  const [tonnageSeries, setTonnageSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [setsSeries, setSetsSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [benchSeries, setBenchSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [squatSeries, setSquatSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [dlSeries, setDlSeries] = useState<{ xLabel: string; y: number }[]>([]);

  // -----------------------------
  // Auth boot + autosync
  // -----------------------------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const stop = startAutoSync(setStatus);
    return stop;
  }, [userId]);

  // Timer tick
  useEffect(() => {
    if (!timerOn) return;
    const t = window.setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [timerOn]);

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Account created. If email confirmation is ON, confirm then sign in.");
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setTab("quick");
    setOpenSessionId(null);
    setOpenTemplateId(null);
    setLastByExerciseName({});
        setDraftByExerciseId((prev) => {
      const next = { ...prev };
      for (const e of ex) {
        if (!next[e.id]) next[e.id] = { weight: "", reps: "", rpe: "", warmup: false };
      }
      return next;
    });

    // Coach suggestions (based on local history)
    setCoachBusy(true);
    try {
      const entries = await Promise.all(
        ex.map(async (e) => {
          const rec = await computeCoachForExerciseName(e.name, sessionId);
          return [e.name, rec] as const;
        })
      );
      setCoachByExerciseName((prev) => {
        const next = { ...prev };
        for (const [name, rec] of entries) next[name] = rec;
        return next;
      });
    } finally {
      setCoachBusy(false);
    }
  }

  function setsForExercise(exerciseId: string) {
    return sets
      .filter((s) => s.exercise_id === exerciseId)
      .sort((a, b) => a.set_number - b.set_number);
  }

  async function createWorkoutSession() {
    if (!userId) return;

    const id = uuid();
    const started_at = new Date().toISOString();

    const local: LocalWorkoutSession = {
      id,
      user_id: userId,
      day_date: dayDate,
      started_at,
      title: "Week 1 Day 1",
      notes: null
    };

    await localdb.localSessions.put(local);

    await enqueue("create_workout", {
      id,
      user_id: userId,
      day_date: dayDate,
      started_at,
      title: local.title,
      notes: null
    });

    await loadTodaySessions();
    await openSession(id);
    setTab("workout");
  }

  function updateDraft(exerciseId: string, patch: Partial<ExerciseDraft>) {
    setDraftByExerciseId((prev) => ({
      ...prev,
      [exerciseId]: { ...(prev[exerciseId] ?? { weight: "", reps: "", rpe: "", warmup: false }), ...patch }
    }));
  }

  async function addExercise() {
    if (!openSessionId) return;

    const name = newExerciseName.trim();
    if (!name) return;

    const id = uuid();
    const sort_order = exercises.length;

    const local: LocalWorkoutExercise = {
      id,
      session_id: openSessionId,
      name,
      sort_order
    };

    await localdb.localExercises.put(local);

    await enqueue("insert_exercise", {
      id,
      session_id: openSessionId,
      name,
      sort_order
    });

    setNewExerciseName("");

    setDraftByExerciseId((prev) => ({
      ...prev,
      [id]: prev[id] ?? { weight: "", reps: "", rpe: "", warmup: false }
    }));

    await openSession(openSessionId);

    await ensureLastForExerciseName(name);
    applyDefaultAutofill(id, name);
  }

  async function addSet(exerciseId: string) {
    const d = draftByExerciseId[exerciseId] ?? { weight: "", reps: "", rpe: "", warmup: false };

    const reps = d.reps ? Number(d.reps) : null;
    const w = d.weight ? Number(d.weight) : null;

    if (!reps || reps <= 0) {
      alert("Reps required.");
      return;
    }

    const existing = await localdb.localSets.where({ exercise_id: exerciseId }).toArray();
    const nextSetNumber = (existing?.length ?? 0) + 1;

    const id = uuid();
    const local: LocalWorkoutSet = {
      id,
      exercise_id: exerciseId,
      set_number: nextSetNumber,
      weight_lbs: w,
      reps,
      rpe: advanced && d.rpe ? Number(d.rpe) : null,
      is_warmup: advanced ? !!d.warmup : false
    };

    await localdb.localSets.put(local);

    await enqueue("insert_set", {
      id,
      exercise_id: exerciseId,
      set_number: nextSetNumber,
      weight_lbs: w,
      reps,
      rpe: advanced && d.rpe ? Number(d.rpe) : null,
      is_warmup: advanced ? !!d.warmup : false
    });

    updateDraft(exerciseId, { weight: "", reps: "", rpe: "", warmup: false });

    setSecs(90);
    setTimerOn(true);

    if (openSessionId) await openSession(openSessionId);

    const ex = exercises.find((e) => e.id === exerciseId);
    if (ex) {
      setLastByExerciseName((prev) => {
        const prevSummary = prev[ex.name];
        const appended: SetLite = {
          weight_lbs: w ?? null,
          reps: reps ?? null,
          rpe: advanced && d.rpe ? Number(d.rpe) : null,
          is_warmup: advanced ? !!d.warmup : false
        };
        return {
          ...prev,
          [ex.name]: {
            source: "local",
            started_at: new Date().toISOString(),
            sets: prevSummary?.sets ? [...prevSummary.sets, appended] : [appended]
          }
        };
      });
    }
  }

  // -----------------------------
  // Delete Session (local now + cloud queued)
  // -----------------------------
  async function deleteSession(sessionId: string) {
    const sess = sessions.find((s) => s.id === sessionId) ?? null;
    const label = sess ? `${sess.title} @ ${new Date(sess.started_at).toLocaleTimeString()}` : sessionId;

    const ok = confirm(
      `Delete this entire session (and all sets/exercises)?\n\n${label}\n\nThis removes it locally immediately and queues a cloud delete.`
    );
    if (!ok) return;

    try {
      // local delete in one transaction
      await localdb.transaction("rw", localdb.localSessions, localdb.localExercises, localdb.localSets, async () => {
        const ex = await localdb.localExercises.where({ session_id: sessionId }).toArray();
        const exIds = ex.map((e) => e.id);

        for (const exId of exIds) {
          await localdb.localSets.where({ exercise_id: exId }).delete();
        }
        await localdb.localExercises.where({ session_id: sessionId }).delete();
        await localdb.localSessions.delete(sessionId);
      });

      // queue cloud delete (handled in sync.ts update below)
      await enqueue("delete_session", { session_id: sessionId });

      // refresh UI
      setOpenSessionId((cur) => (cur === sessionId ? null : cur));
      setExercises((cur) => (openSessionId === sessionId ? [] : cur));
      setSets((cur) => (openSessionId === sessionId ? [] : cur));
      setDraftByExerciseId((prev) => {
        if (openSessionId !== sessionId) return prev;
        return {};
      });

      await loadTodaySessions();
      alert("Session deleted (local). Will sync delete when online.");
    } catch (e: any) {
      console.error(e);
      alert(`Delete failed: ${e?.message ?? String(e)}`);
    }
  }

  // -----------------------------
  // Templates
  // -----------------------------
  async function loadTemplates() {
    if (!userId) return;
    const rows = await localdb.localTemplates.where({ user_id: userId }).sortBy("created_at");
    setTemplates(rows.reverse());
  }

  async function openTemplate(templateId: string) {
    setOpenTemplateId(templateId);
    const ex = await localdb.localTemplateExercises.where({ template_id: templateId }).sortBy("sort_order");
    setTemplateExercises(ex);
  }

  async function createTemplate() {
    if (!userId) return;
    const name = newTemplateName.trim();
    if (!name) {
      alert("Template name required.");
      return;
    }

    const id = uuid();
    const created_at = new Date().toISOString();

    const local: LocalWorkoutTemplate = {
      id,
      user_id: userId,
      name,
      description: newTemplateDesc.trim() || null,
      created_at
    };

    await localdb.localTemplates.put(local);

    await enqueue("create_template", {
      id,
      user_id: userId,
      name: local.name,
      description: local.description,
      created_at
    });

    setNewTemplateName("");
    setNewTemplateDesc("");

    await loadTemplates();
    await openTemplate(id);
  }

  async function addExerciseToTemplate() {
    if (!openTemplateId) return;
    const name = newTemplateExerciseName.trim();
    if (!name) return;

    const id = uuid();
    const sort_order = templateExercises.length;

    const local: LocalWorkoutTemplateExercise = {
      id,
      template_id: openTemplateId,
      name,
      sort_order
    };

    await localdb.localTemplateExercises.put(local);

    await enqueue("insert_template_exercise", {
      id,
      template_id: openTemplateId,
      name,
      sort_order
    });

    setNewTemplateExerciseName("");
    await openTemplate(openTemplateId);
  }

  async function startSessionFromTemplate() {
    if (!userId) return;
    if (!openTemplateId) {
      alert("Pick a template first.");
      return;
    }

    const t = templates.find((x) => x.id === openTemplateId) ?? null;
    const ex = await localdb.localTemplateExercises.where({ template_id: openTemplateId }).sortBy("sort_order");

    if (!t) {
      alert("Template not found.");
      return;
    }
    if (ex.length === 0) {
      alert("Template needs at least 1 exercise.");
      return;
    }

    const sessionId = uuid();
    const started_at = new Date().toISOString();

    const localSession: LocalWorkoutSession = {
      id: sessionId,
      user_id: userId,
      day_date: dayDate,
      started_at,
      title: t.name,
      notes: null
    };

    await localdb.localSessions.put(localSession);

    await enqueue("create_workout", {
      id: sessionId,
      user_id: userId,
      day_date: dayDate,
      started_at,
      title: t.name,
      notes: null
    });

    for (let i = 0; i < ex.length; i++) {
      const te = ex[i];
      const exerciseId = uuid();

      const localExercise: LocalWorkoutExercise = {
        id: exerciseId,
        session_id: sessionId,
        name: te.name,
        sort_order: i
      };

      await localdb.localExercises.put(localExercise);

      await enqueue("insert_exercise", {
        id: exerciseId,
        session_id: sessionId,
        name: te.name,
        sort_order: i
      });

      setDraftByExerciseId((prev) => ({
        ...prev,
        [exerciseId]: prev[exerciseId] ?? { weight: "", reps: "", rpe: "", warmup: false }
      }));
    }

    await loadTodaySessions();
    await openSession(sessionId);
    setTab("workout");
    alert("Session created from template (instant).");
  }

  // -----------------------------
  // Last numbers
  // -----------------------------
  async function getLocalLastForExerciseName(exName: string, excludeSessionId: string | null): Promise<LastSetSummary | null> {
    const allExercises = await localdb.localExercises.toArray();
    const matches = allExercises.filter((e) => e.name === exName && e.session_id !== excludeSessionId);
    if (matches.length === 0) return null;

    let best: { ex: LocalWorkoutExercise; started_at: string } | null = null;
    for (const e of matches) {
      const s = await localdb.localSessions.get(e.session_id);
      if (!s) continue;
      if (!best || s.started_at > best.started_at) best = { ex: e, started_at: s.started_at };
    }
    if (!best) return null;

    const ss = await localdb.localSets.where({ exercise_id: best.ex.id }).sortBy("set_number");
    if (ss.length === 0) return null;

    const all = ss.map((x) => ({
      weight_lbs: x.weight_lbs ?? null,
      reps: x.reps ?? null,
      rpe: x.rpe ?? null,
      is_warmup: !!x.is_warmup
    }));

    return { source: "local", started_at: best.started_at, sets: all };
  }

  async function getCloudLastForExerciseName(exName: string): Promise<LastSetSummary | null> {
    if (!userId) return null;
    if (!navigator.onLine) return null;

    const { data: sess, error: sessErr } = await supabase
      .from("workout_sessions")
      .select("id, started_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(30);

    if (sessErr || !sess || sess.length === 0) return null;

    const sessionIds = sess.map((s) => s.id);

    const { data: ex, error: exErr } = await supabase
      .from("workout_exercises")
      .select("id, session_id, name")
      .eq("name", exName)
      .in("session_id", sessionIds);

    if (exErr || !ex || ex.length === 0) return null;

    const sessionRank = new Map<string, number>();
    sess.forEach((s, idx) => sessionRank.set(s.id, idx));

    let best = ex[0];
    for (const e of ex) {
      const rBest = sessionRank.get(best.session_id) ?? 9999;
      const rE = sessionRank.get(e.session_id) ?? 9999;
      if (rE < rBest) best = e;
    }

    const started_at = (sess.find((s) => s.id === best.session_id)?.started_at as string) ?? new Date().toISOString();

    const { data: ss, error: ssErr } = await supabase
      .from("workout_sets")
      .select("weight_lbs, reps, rpe, is_warmup, set_number")
      .eq("exercise_id", best.id)
      .order("set_number", { ascending: true });

    if (ssErr || !ss || ss.length === 0) return null;

    const all = ss.map((x) => ({
      weight_lbs: x.weight_lbs ?? null,
      reps: x.reps ?? null,
      rpe: x.rpe ?? null,
      is_warmup: !!x.is_warmup
    }));

    return { source: "cloud", started_at, sets: all };
  }

  async function ensureLastForExerciseName(exName: string) {
    if (lastByExerciseName[exName]) return;

    const local = await getLocalLastForExerciseName(exName, openSessionId);
    if (local) {
      setLastByExerciseName((prev) => ({ ...prev, [exName]: local }));
      return;
    }

    const cloud = await getCloudLastForExerciseName(exName);
    if (cloud) {
      setLastByExerciseName((prev) => ({ ...prev, [exName]: cloud }));
      return;
    }
  }

  // -----------------------------
  // Coach suggestions (Hybrid: conservative compounds, aggressive accessories)
  // Works even if you don't store explicit rep targets; it uses e1RM + RPE trend.
  // -----------------------------
  function pct(a: number, b: number): number {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
    return ((a - b) / b) * 100;
  }

  function computeE1RM(weight: number, reps: number): number {
    return oneRmEpley(weight, reps);
  }

  async function computeCoachForExerciseName(exName: string, excludeSessionId?: string | null): Promise<CoachRec | undefined> {
    // Gather last 3 sessions (local) for this exercise name, using best work set e1RM per session.
    const allExercises = await localdb.localExercises.toArray();
    const matches = allExercises.filter((e) => e.name === exName && (!excludeSessionId || e.session_id !== excludeSessionId));

    if (matches.length === 0) return undefined;

    const sessionsMap = new Map<string, LocalWorkoutSession>();
    const allSessions = await localdb.localSessions.toArray();
    for (const s of allSessions) sessionsMap.set(s.id, s);

    const perSession: {
      session_id: string;
      started_at: string;
      top: { weight: number; reps: number; rpe: number | null; e1rm: number } | null;
    }[] = [];

    for (const ex of matches) {
      const sess = sessionsMap.get(ex.session_id);
      const started_at = sess?.started_at ?? new Date(0).toISOString();

      const rows = await localdb.localSets.where({ exercise_id: ex.id }).toArray();
      const work = rows.filter((s) => !s.is_warmup && s.weight_lbs != null && s.reps != null);

      if (work.length === 0) {
        perSession.push({ session_id: ex.session_id, started_at, top: null });
        continue;
      }

      const top = work
        .map((s) => {
          const w = Number(s.weight_lbs);
          const r = Number(s.reps);
          const e1rm = computeE1RM(w, r);
          return { weight: w, reps: r, rpe: s.rpe != null ? Number(s.rpe) : null, e1rm };
        })
        .sort((a, b) => b.e1rm - a.e1rm)[0];

      perSession.push({ session_id: ex.session_id, started_at, top });
    }

    // Deduplicate by session (if exercise name appears twice in same session, keep best top)
    const bestBySession = new Map<string, { started_at: string; top: { weight: number; reps: number; rpe: number | null; e1rm: number } | null }>();
    for (const row of perSession) {
      const prev = bestBySession.get(row.session_id);
      if (!prev) {
        bestBySession.set(row.session_id, { started_at: row.started_at, top: row.top });
      } else {
        const prevTop = prev.top;
        const curTop = row.top;
        if (!prevTop && curTop) bestBySession.set(row.session_id, { started_at: row.started_at, top: curTop });
        else if (prevTop && curTop && curTop.e1rm > prevTop.e1rm) bestBySession.set(row.session_id, { started_at: row.started_at, top: curTop });
      }
    }

    const hist = Array.from(bestBySession.values())
      .filter((x) => x.top != null)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .slice(0, 3);

    if (hist.length === 0) return undefined;

    const last = hist[0]!.top!;
    const prev = hist.length >= 2 ? hist[1]!.top! : null;
    const prev2 = hist.length >= 3 ? hist[2]!.top! : null;

    const delta = prev ? pct(last.e1rm, prev.e1rm) : null;
    const compound = isCompoundExercise(exName);

    const lastRpe = last.rpe;
    const strong = lastRpe == null ? true : lastRpe <= 8;
    const grindy = lastRpe != null && lastRpe >= 9;

    if (compound) {
      const down3 =
        prev && prev2 &&
        last.e1rm < prev.e1rm * 0.995 &&
        prev.e1rm < prev2.e1rm * 0.995;

      if (down3) {
        return {
          label: "DELOAD",
          headline: "Deload suggestion: -5% next time",
          detail: "Your best work-set e1RM is down three sessions in a row. Back off slightly, keep the bar speed snappy, then rebuild.",
          deltaPct: delta,
          lastTop: last,
          prevTop: prev
        };
      }

      if (grindy) {
        return {
          label: "HOLD",
          headline: "Hold load next time",
          detail: "Last top set looked grindy (RPE 9+). Keep weight the same and earn cleaner reps before adding load.",
          deltaPct: delta,
          lastTop: last,
          prevTop: prev
        };
      }

      if (prev && last.e1rm >= prev.e1rm * 1.005 && strong) {
        return {
          label: "ADD_WEIGHT",
          headline: "Add +5 lbs next time",
          detail: "e1RM is up and RPE is under control. Conservative compound progression: +5 and repeat.",
          deltaPct: delta,
          lastTop: last,
          prevTop: prev
        };
      }

      return {
        label: "HOLD",
        headline: "Hold load next time",
        detail: "Keep the same weight and focus on smoother reps / better speed. Add load when it’s clearly earned.",
        deltaPct: delta,
        lastTop: last,
        prevTop: prev
      };
    }

    // Accessories: reps-first, then load
    if (grindy) {
      return {
        label: "HOLD",
        headline: "Hold and clean it up",
        detail: "Accessory was grindy (RPE 9+). Keep load and aim for better reps before progressing.",
        deltaPct: delta,
        lastTop: last,
        prevTop: prev
      };
    }

    if (last.reps >= 12) {
      return {
        label: "ADD_WEIGHT",
        headline: "Small load bump next time (+2.5–5 lbs)",
        detail: "You’re at the top end of the usual accessory rep range. Nudge weight up a hair and keep reps honest.",
        deltaPct: delta,
        lastTop: last,
        prevTop: prev
      };
    }

    return {
      label: "ADD_REPS",
      headline: "Add +1–2 reps next time",
      detail: "Aggressive accessory progression: add reps until you’re living in the 10–15 zone, then add weight.",
      deltaPct: delta,
      lastTop: last,
      prevTop: prev
    };
  }

  async function refreshCoachForVisibleExercises() {
    if (!openSessionId) return;
    setCoachBusy(true);
    try {
      const entries = await Promise.all(
        exercises.map(async (ex) => {
          const rec = await computeCoachForExerciseName(ex.name, openSessionId);
          return [ex.name, rec] as const;
        })
      );
      setCoachByExerciseName((prev) => {
        const next = { ...prev };
        for (const [name, rec] of entries) next[name] = rec;
        return next;
      });
    } finally {
      setCoachBusy(false);
    }
  }

  function pickLastSet(setsAll: SetLite[]): SetLite | null {
    if (setsAll.length === 0) return null;
    return setsAll[setsAll.length - 1];
  }

  function pickFirstWorkSet(setsAll: SetLite[]): SetLite | null {
    const work = setsAll.find((s) => !s.is_warmup && (s.reps ?? 0) > 0);
    return work ?? setsAll[0] ?? null;
  }

  function pickTopSet(setsAll: SetLite[]): SetLite | null {
    let best: SetLite | null = null;
    for (const s of setsAll) {
      const w = s.weight_lbs ?? -1;
      const r = s.reps ?? -1;
      if (!best) {
        best = s;
        continue;
      }
      const bw = best.weight_lbs ?? -1;
      const br = best.reps ?? -1;
      if (w > bw) best = s;
      else if (w === bw && r > br) best = s;
    }
    return best;
  }

  function applyDefaultAutofill(exerciseId: string, exName: string) {
    const summary = lastByExerciseName[exName];
    if (!summary || summary.sets.length === 0) return;

    const existing = draftByExerciseId[exerciseId];
    if (existing && (existing.weight || existing.reps)) return;

    const compound = isCompoundExercise(exName);
    const chosen = compound ? pickFirstWorkSet(summary.sets) : pickTopSet(summary.sets);
    if (!chosen) return;

    updateDraft(exerciseId, {
      weight: chosen.weight_lbs != null ? String(chosen.weight_lbs) : "",
      reps: chosen.reps != null ? String(chosen.reps) : "",
      rpe: chosen.rpe != null ? String(chosen.rpe) : "",
      warmup: !!chosen.is_warmup
    });
  }

  function applyLastModeToDraft(exerciseId: string, exName: string, mode: "last" | "top" | "firstWork") {
    const summary = lastByExerciseName[exName];
    if (!summary || summary.sets.length === 0) return;

    const chosen =
      mode === "last"
        ? pickLastSet(summary.sets)
        : mode === "top"
          ? pickTopSet(summary.sets)
          : pickFirstWorkSet(summary.sets);

    if (!chosen) return;

    updateDraft(exerciseId, {
      weight: chosen.weight_lbs != null ? String(chosen.weight_lbs) : "",
      reps: chosen.reps != null ? String(chosen.reps) : "",
      rpe: chosen.rpe != null ? String(chosen.rpe) : "",
      warmup: !!chosen.is_warmup
    });
  }

  // -----------------------------
  // Dashboard computations (local, offline)
  // -----------------------------
  async function refreshDashboard() {
    if (!userId) return;
    setDashBusy(true);
    try {
      // last 28 days of sessions for this user
      const allSessions = await localdb.localSessions.where({ user_id: userId }).toArray();

      // Map session_id -> day
      const sessionDay = new Map<string, string>();
      for (const s of allSessions) {
        const day = s.day_date || isoToDay(s.started_at);
        sessionDay.set(s.id, day);
      }

      // Load all exercises/sets (local)
      const allExercises = await localdb.localExercises.toArray();
      const allSets = await localdb.localSets.toArray();

      // exerciseId -> { sessionId, name }
      const exInfo = new Map<string, { session_id: string; name: string }>();
      for (const e of allExercises) exInfo.set(e.id, { session_id: e.session_id, name: e.name });

      // Aggregate per-day tonnage and set counts
      const tonnageByDay = new Map<string, number>();
      const setsByDay = new Map<string, number>();

      // Per-day best e1RM for selected lift buckets (by exercise name match)
      const bestBenchE1RM = new Map<string, number>();
      const bestSquatE1RM = new Map<string, number>();
      const bestDlE1RM = new Map<string, number>();

      function bumpMax(map: Map<string, number>, day: string, val: number) {
        const cur = map.get(day);
        if (cur == null || val > cur) map.set(day, val);
      }

      for (const s of allSets) {
        const info = exInfo.get(s.exercise_id);
        if (!info) continue;
        const day = sessionDay.get(info.session_id);
        if (!day) continue;

        setsByDay.set(day, (setsByDay.get(day) ?? 0) + 1);

        const w = s.weight_lbs ?? 0;
        const r = s.reps ?? 0;
        if (w > 0 && r > 0) {
          tonnageByDay.set(day, (tonnageByDay.get(day) ?? 0) + w * r);

          // e1RM (best per day) for bucketed names
          const n = info.name.toLowerCase();
          const e1 = oneRmEpley(w, r);

          if (n.includes("bench")) bumpMax(bestBenchE1RM, day, e1);
          if (n.includes("squat")) bumpMax(bestSquatE1RM, day, e1);
          if (n.includes("deadlift") || n === "dl") bumpMax(bestDlE1RM, day, e1);
        }
      }

      // Build last 28 days axis
      const end = new Date();
      const days: string[] = [];
      for (let i = 27; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(end.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        days.push(`${yyyy}-${mm}-${dd}`);
      }

      const tonSeries = days.map((d) => ({ xLabel: d.slice(5), y: Math.round(tonnageByDay.get(d) ?? 0) }));
      const setSeries = days.map((d) => ({ xLabel: d.slice(5), y: setsByDay.get(d) ?? 0 }));

      // e1RM series: only plot days where there is data (otherwise it looks like flatlined heart monitor)
      const bench = days
        .filter((d) => bestBenchE1RM.get(d) != null)
        .map((d) => ({ xLabel: d.slice(5), y: bestBenchE1RM.get(d)! }));

      const squat = days
        .filter((d) => bestSquatE1RM.get(d) != null)
        .map((d) => ({ xLabel: d.slice(5), y: bestSquatE1RM.get(d)! }));

      const dl = days
        .filter((d) => bestDlE1RM.get(d) != null)
        .map((d) => ({ xLabel: d.slice(5), y: bestDlE1RM.get(d)! }));

      setTonnageSeries(tonSeries);
      setSetsSeries(setSeries);
      setBenchSeries(bench);
      setSquatSeries(squat);
      setDlSeries(dl);
    } finally {
      setDashBusy(false);
    }
  }

  // -----------------------------
  // Effects
  // -----------------------------
  useEffect(() => {
    if (!userId) return;
    loadTodaySessions();
    loadTemplates();
  }, [userId]);

  useEffect(() => {
    if (!openSessionId) return;
    (async () => {
      for (const ex of exercises) {
        await ensureLastForExerciseName(ex.name);
        applyDefaultAutofill(ex.id, ex.name);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSessionId, exercises.length]);

  // refresh dashboard when opening the dashboard tab
  useEffect(() => {
    if (!userId) return;
    if (tab !== "dash") return;
    void refreshDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, userId]);

  // -----------------------------
  // Render
  // -----------------------------
  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

  if (!userId) {
    return (
      <div style={{ padding: 20, maxWidth: 520 }}>
        <h2>Rebuild @ 60 Tracker</h2>
        <p>Login for private, offline-first logging.</p>

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={signIn}>Sign In</button>
          <button onClick={signUp}>Sign Up</button>
        </div>
      </div>
    );
  }

  const openSessionObj = sessions.find((s) => s.id === openSessionId) ?? null;

  return (
    <div style={{ padding: 20, maxWidth: 950 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Rebuild @ 60 Tracker</h2>
        <button onClick={signOut}>Sign Out</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <b>Today:</b> {dayDate} (Week 1 Day 1)
        </div>
        <div>
          <b>Status:</b> {navigator.onLine ? status : "Offline (logging still works)"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={() => setTab("quick")} disabled={tab === "quick"}>
          Quick Log
        </button>
        <button
          onClick={() => {
            setTab("workout");
            loadTodaySessions();
            loadTemplates();
          }}
          disabled={tab === "workout"}
        >
          Workout
        </button>
        <button
          onClick={() => setTab("dash")}
          disabled={tab === "dash"}
          title="Charts are computed from your local workout history"
        >
          Dashboard
        </button>
      </div>

      <hr />

      {tab === "dash" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Dashboard</h3>
            <button onClick={refreshDashboard} disabled={dashBusy}>
              {dashBusy ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
            Everything here is built from your <b>local</b> workout data (sessions/exercises/sets), so it works offline.
            Delete your test sessions and refresh to clean the charts.
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <LineChart title="Training Volume (Tonnage) — last 28 days" points={tonnageSeries} />
            <LineChart title="Total Sets — last 28 days" points={setsSeries} />
          </div>

          <h4 style={{ marginTop: 18, marginBottom: 8 }}>Strength Trend (Best e1RM per day)</h4>
          <div style={{ display: "grid", gap: 12 }}>
            <LineChart title="Bench (name includes 'bench')" points={benchSeries} />
            <LineChart title="Squat (name includes 'squat')" points={squatSeries} />
            <LineChart title="Deadlift (name includes 'deadlift' or 'dl')" points={dlSeries} />
          </div>

          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>
            <b>Note:</b> These strength charts match by exercise name keywords. If you use names like “Flat BB Press”,
            it won’t show in “bench” until we add that alias. Tell me your exact lift names and I’ll make the matcher
            smarter (without making it slow).
          </div>
        </>
      )}

      {tab === "quick" && (
        <>
          <h3>60-Second Quick Log</h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <input placeholder="Weight (lbs)" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <input placeholder="Waist (in)" value={waist} onChange={(e) => setWaist(e.target.value)} />
            <input placeholder="Sleep (hours)" value={sleepHours} onChange={(e) => setSleepHours(e.target.value)} />
            <input placeholder="Calories" value={calories} onChange={(e) => setCalories(e.target.value)} />
            <input placeholder="Protein (g)" value={protein} onChange={(e) => setProtein(e.target.value)} />
            <input placeholder="Zone 2 minutes" value={z2Minutes} onChange={(e) => setZ2Minutes(e.target.value)} />
          </div>

          <textarea
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: "100%", marginTop: 10, height: 70 }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={saveQuickLog}>Save Quick Log</button>
          </div>

          <hr />

          <h3>Backup / Restore</h3>
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={exportBackup} disabled={backupBusy}>
                {backupBusy ? "Working…" : "Export Backup (.json)"}
              </button>

              <button
                onClick={() => importFileRef.current?.click()}
                disabled={backupBusy}
                title="Import will overwrite local data on this device"
              >
                {backupBusy ? "Working…" : "Import Backup (.json)"}
              </button>

              <input
                ref={importFileRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importBackupFile(f);
                }}
              />
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>
              <b>Tip:</b> Export after big updates (new templates, new week block). Save it to iCloud/Drive/Dropbox.
              Import is for “new phone” or “oh crap”.
            </div>
          </div>

          <hr />

          <h3>Rest Timer</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => { setSecs(90); setTimerOn(true); }}>Start 90s</button>
            <button onClick={() => { setSecs(120); setTimerOn(true); }}>Start 120s</button>
            <button onClick={() => setTimerOn((v) => !v)}>{timerOn ? "Pause" : "Resume"}</button>
            <button onClick={() => { setTimerOn(false); setSecs(90); }}>Reset</button>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
            </div>
          </div>
        </>
      )}

      {tab === "workout" && (
        <>
          <h3>Workout Logger</h3>

          {/* Templates block */}
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginTop: 10 }}>
            <h4 style={{ marginTop: 0 }}>Templates</h4>

            <div style={{ display: "grid", gap: 8 }}>
              <input
                placeholder="New template name (e.g., Lower A)"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
              />
              <input
                placeholder="Description (optional)"
                value={newTemplateDesc}
                onChange={(e) => setNewTemplateDesc(e.target.value)}
              />
              <button onClick={createTemplate}>Create Template</button>
            </div>

            {templates.length > 0 && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTemplate(t.id)}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      border: t.id === openTemplateId ? "2px solid black" : "1px solid #ccc",
                      borderRadius: 8
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{t.name}</div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>{t.description ?? ""}</div>
                  </button>
                ))}
              </div>
            )}

            {openTemplateId && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    placeholder="Add exercise to template"
                    value={newTemplateExerciseName}
                    onChange={(e) => setNewTemplateExerciseName(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button onClick={addExerciseToTemplate}>Add</button>
                </div>

                {templateExercises.length > 0 && (
                  <div style={{ marginTop: 10, opacity: 0.9 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Template exercises</div>
                    <ol>
                      {templateExercises
                        .slice()
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((e) => (
                          <li key={e.id}>{e.name}</li>
                        ))}
                    </ol>
                  </div>
                )}

                <button onClick={startSessionFromTemplate} style={{ marginTop: 10 }}>
                  Start Session from Template
                </button>
              </div>
            )}
          </div>

          <hr />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h4 style={{ margin: 0 }}>Sessions Today</h4>
            <button onClick={createWorkoutSession}>+ New Session</button>
          </div>

          {sessions.length === 0 ? (
            <p style={{ marginTop: 10 }}>No sessions today yet. Create one or start from a template.</p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    border: s.id === openSessionId ? "2px solid black" : "1px solid #ccc",
                    borderRadius: 8,
                    padding: 12
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <button
                      onClick={() => openSession(s.id)}
                      style={{ textAlign: "left", padding: 0, border: "none", background: "transparent", flex: 1 }}
                    >
                      <div style={{ fontWeight: 700 }}>{s.title}</div>
                      <div style={{ opacity: 0.8, fontSize: 12 }}>{new Date(s.started_at).toLocaleTimeString()}</div>
                    </button>

                    <button
                      onClick={() => deleteSession(s.id)}
                      title="Delete session (and all sets)"
                      style={{ opacity: 0.9 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {openSessionObj && (
            <>
              <hr />
              <h4 style={{ marginBottom: 6 }}>{openSessionObj.title}</h4>

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <input
                  placeholder="Add exercise (e.g., Leverage Squat)"
                  value={newExerciseName}
                  onChange={(e) => setNewExerciseName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button onClick={addExercise}>Add</button>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
                  Advanced (RPE + Warmup)
                </label>
              </div>

              {exercises.length === 0 ? (
                <p style={{ marginTop: 12 }}>Add your first exercise and start logging sets.</p>
              ) : (
                <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                  {exercises.map((ex) => {
                    const exSets = setsForExercise(ex.id);
                    const lastSummary = lastByExerciseName[ex.name];
                    const preview = lastSummary?.sets ? lastSummary.sets.slice(-3) : [];
                    const d = draftByExerciseId[ex.id] ?? { weight: "", reps: "", rpe: "", warmup: false };

                    const compound = isCompoundExercise(ex.name);
                    const defaultLabel = compound ? "Default: 1st work" : "Default: top set";

                    const coach = coachByExerciseName[ex.name];
                    const coachBadge = coach?.label === "ADD_WEIGHT" ? "➕" : coach?.label === "ADD_REPS" ? "🧱" : coach?.label === "DELOAD" ? "🧯" : "🧊";

                    return (
                      <div key={ex.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontWeight: 800 }}>
                            {ex.name}{" "}
                            <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 600 }}>
                              ({defaultLabel})
                            </span>
                          </div>
                          <button onClick={() => ensureLastForExerciseName(ex.name)} style={{ padding: "6px 10px" }}>
                            Refresh
                          </button>
                        </div>

                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                          {lastSummary ? (
                            <>
                              <div>
                                <b>Last ({lastSummary.source}):</b>{" "}
                                {preview.map((s, i) => (
                                  <span key={i}>
                                    {formatSet(s)}
                                    {i < preview.length - 1 ? ", " : ""}
                                  </span>
                                ))}
                              </div>
                              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                                <button onClick={() => applyLastModeToDraft(ex.id, ex.name, "last")}>Use Last Set</button>
                                <button onClick={() => applyLastModeToDraft(ex.id, ex.name, "top")}>Use Top Set</button>
                                <button onClick={() => applyLastModeToDraft(ex.id, ex.name, "firstWork")}>Use First Work</button>
                              </div>
                            </>
                          ) : (
                            <div style={{ opacity: 0.7 }}>
                              <b>Last:</b> (none yet){" "}
                              <button onClick={() => ensureLastForExerciseName(ex.name)} style={{ marginLeft: 8 }}>
                                check
                              </button>
                            </div>
                          )}
                        </div>


                        <div style={{ marginTop: 10, border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                            <div style={{ fontWeight: 800 }}>Coach {coachBadge}</div>
                            <button onClick={refreshCoachForVisibleExercises} disabled={coachBusy} style={{ fontSize: 12 }}>
                              {coachBusy ? "Refreshing…" : "Refresh Coach"}
                            </button>
                          </div>

                          {coach ? (
                            <>
                              <div style={{ marginTop: 6, fontWeight: 800 }}>{coach.headline}</div>
                              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4, lineHeight: 1.35 }}>{coach.detail}</div>

                              {(coach.lastTop || coach.prevTop) && (
                                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8, lineHeight: 1.35 }}>
                                  {coach.lastTop ? (
                                    <div>
                                      <b>Last top:</b> {coach.lastTop.weight} x {coach.lastTop.reps}
                                      {coach.lastTop.rpe != null ? ` @${coach.lastTop.rpe}` : ""}{" "}
                                      <span style={{ opacity: 0.8 }}>(~e1RM {coach.lastTop.e1rm})</span>
                                    </div>
                                  ) : null}
                                  {coach.prevTop ? (
                                    <div>
                                      <b>Prev top:</b> {coach.prevTop.weight} x {coach.prevTop.reps}{" "}
                                      <span style={{ opacity: 0.8 }}>(~e1RM {coach.prevTop.e1rm})</span>
                                    </div>
                                  ) : null}
                                  {coach.deltaPct != null && Number.isFinite(coach.deltaPct) ? (
                                    <div>
                                      <b>Trend:</b> {coach.deltaPct.toFixed(1)}%
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                              No history yet for this exercise name. Once you repeat it across sessions, you’ll get a real recommendation.
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: advanced ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
                            gap: 8,
                            marginTop: 10
                          }}
                        >
                          <input
                            placeholder="Weight"
                            value={d.weight}
                            onChange={(e) => updateDraft(ex.id, { weight: e.target.value })}
                          />
                          <input
                            placeholder="Reps"
                            value={d.reps}
                            onChange={(e) => updateDraft(ex.id, { reps: e.target.value })}
                          />
                          {advanced && (
                            <input
                              placeholder="RPE"
                              value={d.rpe}
                              onChange={(e) => updateDraft(ex.id, { rpe: e.target.value })}
                            />
                          )}
                          <button onClick={() => addSet(ex.id)}>Save Set</button>
                        </div>

                        {advanced && (
                          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <input
                              type="checkbox"
                              checked={d.warmup}
                              onChange={(e) => updateDraft(ex.id, { warmup: e.target.checked })}
                            />
                            Warmup set
                          </label>
                        )}

                        {exSets.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Sets (today)</div>
                            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                              {exSets.map((s) => {
                                const est =
                                  s.weight_lbs != null && s.reps != null
                                    ? oneRmEpley(Number(s.weight_lbs), Number(s.reps))
                                    : null;

                                return (
                                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                    <div>
                                      <b>{s.set_number}.</b> {s.weight_lbs ?? "—"} x {s.reps ?? "—"}
                                      {s.is_warmup ? " (WU)" : ""}
                                      {s.rpe != null ? ` @RPE ${s.rpe}` : ""}
                                    </div>
                                    <div style={{ opacity: 0.75 }}>{est ? `~1RM ${est}` : ""}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <hr />

              <h3>Rest Timer</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => { setSecs(90); setTimerOn(true); }}>Start 90s</button>
                <button onClick={() => { setSecs(120); setTimerOn(true); }}>Start 120s</button>
                <button onClick={() => setTimerOn((v) => !v)}>{timerOn ? "Pause" : "Resume"}</button>
                <button onClick={() => { setTimerOn(false); setSecs(90); }}>Reset</button>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}




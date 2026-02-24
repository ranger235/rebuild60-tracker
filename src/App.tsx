import { useEffect, useMemo, useState } from "react";
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

type SetLite = {
  weight_lbs: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
};

type LastSetSummary = {
  source: "local" | "cloud";
  started_at: string; // ISO (best effort)
  sets: SetLite[];    // ALL sets from last workout for that exercise (ordered)
};

function formatSet(s: SetLite) {
  const w = s.weight_lbs ?? "—";
  const r = s.reps ?? "—";
  const wu = s.is_warmup ? "WU" : "";
  const rpe = s.rpe != null ? `@${s.rpe}` : "";
  return `${w}x${r}${wu}${rpe}`;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("…");
  const [tab, setTab] = useState<"quick" | "workout">("quick");

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

  // Workout input UI
  const [newExerciseName, setNewExerciseName] = useState("");
  const [advanced, setAdvanced] = useState(false);

  // Avoid collision with daily setWeight
  const [setWeightInput, setSetWeightInput] = useState("");
  const [setRepsInput, setSetRepsInput] = useState("");
  const [setRpeInput, setSetRpeInput] = useState("");
  const [setWarmup, setSetWarmup] = useState(false);

  // Templates: local-first state
  const [templates, setTemplates] = useState<LocalWorkoutTemplate[]>([]);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [templateExercises, setTemplateExercises] = useState<LocalWorkoutTemplateExercise[]>([]);

  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [newTemplateExerciseName, setNewTemplateExerciseName] = useState("");

  // Last numbers cache (exercise name -> summary)
  const [lastByExerciseName, setLastByExerciseName] = useState<Record<string, LastSetSummary | undefined>>({});

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
  }

  // -----------------------------
  // Quick Log save (offline-safe)
  // -----------------------------
  async function saveQuickLog() {
    if (!userId) return;

    await enqueue("upsert_daily", {
      user_id: userId,
      day_date: dayDate,
      weight_lbs: weight ? Number(weight) : null,
      waist_in: waist ? Number(waist) : null,
      sleep_hours: sleepHours ? Number(sleepHours) : null,
      notes: notes || null
    });

    await enqueue("upsert_nutrition", {
      user_id: userId,
      day_date: dayDate,
      calories: calories ? Number(calories) : null,
      protein_g: protein ? Number(protein) : null
    });

    if (z2Minutes) {
      await enqueue("insert_zone2", {
        user_id: userId,
        day_date: dayDate,
        modality: "Walk",
        minutes: Number(z2Minutes)
      });
    }

    alert("Saved instantly (local). Will sync when online.");
  }

  // -----------------------------
  // Workout: local-first helpers
  // -----------------------------
  async function loadTodaySessions() {
    if (!userId) return;
    const rows = await localdb.localSessions
      .where({ user_id: userId, day_date: dayDate })
      .sortBy("started_at");
    setSessions(rows.reverse());
  }

  async function openSession(sessionId: string) {
    setOpenSessionId(sessionId);

    const ex = await localdb.localExercises.where({ session_id: sessionId }).sortBy("sort_order");
    setExercises(ex);

    const allSets: LocalWorkoutSet[] = [];
    for (const e of ex) {
      const s = await localdb.localSets.where({ exercise_id: e.id }).sortBy("set_number");
      allSets.push(...s);
    }
    setSets(allSets);
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
    await openSession(openSessionId);

    void ensureLastForExerciseName(name);
  }

  async function addSet(exerciseId: string) {
    const reps = setRepsInput ? Number(setRepsInput) : null;
    const w = setWeightInput ? Number(setWeightInput) : null;

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
      rpe: advanced && setRpeInput ? Number(setRpeInput) : null,
      is_warmup: advanced ? !!setWarmup : false
    };

    await localdb.localSets.put(local);

    await enqueue("insert_set", {
      id,
      exercise_id: exerciseId,
      set_number: nextSetNumber,
      weight_lbs: w,
      reps,
      rpe: advanced && setRpeInput ? Number(setRpeInput) : null,
      is_warmup: advanced ? !!setWarmup : false
    });

    // Clear inputs
    setSetWeightInput("");
    setSetRepsInput("");
    setSetRpeInput("");
    setSetWarmup(false);

    // Auto-start rest timer
    setSecs(90);
    setTimerOn(true);

    if (openSessionId) await openSession(openSessionId);

    // Update last cache for that exercise name immediately (feels snappy)
    const ex = exercises.find((e) => e.id === exerciseId);
    if (ex) {
      setLastByExerciseName((prev) => {
        const prevSummary = prev[ex.name];
        const appended: SetLite = {
          weight_lbs: w ?? null,
          reps: reps ?? null,
          rpe: advanced && setRpeInput ? Number(setRpeInput) : null,
          is_warmup: advanced ? !!setWarmup : false
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
  // Templates: local-first helpers
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
    }

    await loadTodaySessions();
    await openSession(sessionId);
    setTab("workout");
    alert("Session created from template (instant).");

    for (const te of ex) void ensureLastForExerciseName(te.name);
  }

  // -----------------------------
  // Last numbers: local first, cloud fallback
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

  function applySetToInputs(s: SetLite) {
    if (s.weight_lbs != null) setSetWeightInput(String(s.weight_lbs));
    if (s.reps != null) setSetRepsInput(String(s.reps));
    if (advanced && s.rpe != null) setSetRpeInput(String(s.rpe));
    if (advanced) setSetWarmup(!!s.is_warmup);
  }

  function pickLastSet(setsAll: SetLite[]): SetLite | null {
    if (setsAll.length === 0) return null;
    return setsAll[setsAll.length - 1];
  }

  function pickFirstWorkSet(setsAll: SetLite[]): SetLite | null {
    // First non-warmup with reps present; fallback to first set
    const work = setsAll.find((s) => !s.is_warmup && (s.reps ?? 0) > 0);
    return work ?? setsAll[0] ?? null;
  }

  function pickTopSet(setsAll: SetLite[]): SetLite | null {
    // Top = highest weight; tie break by reps
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

  function applyLastMode(exName: string, mode: "last" | "top" | "firstWork") {
    const summary = lastByExerciseName[exName];
    if (!summary || summary.sets.length === 0) return;

    const setsAll = summary.sets;
    const chosen =
      mode === "last"
        ? pickLastSet(setsAll)
        : mode === "top"
          ? pickTopSet(setsAll)
          : pickFirstWorkSet(setsAll);

    if (!chosen) return;
    applySetToInputs(chosen);
  }

  // Load caches after login
  useEffect(() => {
    if (!userId) return;
    loadTodaySessions();
    loadTemplates();
  }, [userId]);

  // When you open a session, preload last for all exercises
  useEffect(() => {
    if (!openSessionId) return;
    for (const ex of exercises) void ensureLastForExerciseName(ex.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSessionId, exercises.length]);

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
    <div style={{ padding: 20, maxWidth: 900 }}>
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

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
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
      </div>

      <hr />

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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ margin: 0 }}>Sessions Today</h4>
            <button onClick={createWorkoutSession}>+ New Session</button>
          </div>

          {sessions.length === 0 ? (
            <p style={{ marginTop: 10 }}>No sessions today yet. Create one or start from a template.</p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => openSession(s.id)}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    border: s.id === openSessionId ? "2px solid black" : "1px solid #ccc",
                    borderRadius: 8
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{s.title}</div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    {new Date(s.started_at).toLocaleTimeString()}
                  </div>
                </button>
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

                    return (
                      <div key={ex.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontWeight: 800 }}>{ex.name}</div>
                          <button
                            onClick={() => ensureLastForExerciseName(ex.name)}
                            style={{ padding: "6px 10px" }}
                            title="Refresh last numbers"
                          >
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
                                <button
                                  onClick={() => applyLastMode(ex.name, "last")}
                                  disabled={lastSummary.sets.length === 0}
                                >
                                  Use Last Set
                                </button>
                                <button
                                  onClick={() => applyLastMode(ex.name, "top")}
                                  disabled={lastSummary.sets.length === 0}
                                >
                                  Use Top Set
                                </button>
                                <button
                                  onClick={() => applyLastMode(ex.name, "firstWork")}
                                  disabled={lastSummary.sets.length === 0}
                                >
                                  Use First Work
                                </button>
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
                            value={setWeightInput}
                            onChange={(e) => setSetWeightInput(e.target.value)}
                          />
                          <input
                            placeholder="Reps"
                            value={setRepsInput}
                            onChange={(e) => setSetRepsInput(e.target.value)}
                          />
                          {advanced && (
                            <input
                              placeholder="RPE"
                              value={setRpeInput}
                              onChange={(e) => setSetRpeInput(e.target.value)}
                            />
                          )}
                          <button onClick={() => addSet(ex.id)}>Save Set</button>
                        </div>

                        {advanced && (
                          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <input
                              type="checkbox"
                              checked={setWarmup}
                              onChange={(e) => setSetWarmup(e.target.checked)}
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

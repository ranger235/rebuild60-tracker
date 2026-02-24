import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { enqueue } from "./sync";
import { startAutoSync } from "./sync";

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("…");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const dayDate = useMemo(() => todayISO(), []);
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
  }

  async function saveQuickLog() {
    if (!userId) return;

    // Queue offline-safe ops
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

  async function createWorkoutSession() {
    if (!userId) return;
    await enqueue("create_workout", {
      user_id: userId,
      day_date: dayDate,
      title: "Week 1 Day 1",
      notes: null
    });
    alert("Workout session created (local). Next: add exercise/set screen (Phase 1.1).");
  }

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

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Rebuild @ 60 Tracker</h2>
        <button onClick={signOut}>Sign Out</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div><b>Today:</b> {dayDate} (Week 1 Day 1)</div>
        <div><b>Status:</b> {navigator.onLine ? status : "Offline (logging still works)"}</div>
      </div>

      <hr />

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
        <button onClick={createWorkoutSession}>Create Workout Session</button>
      </div>

      <hr />

      <h3>Rest Timer</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => { setSecs(90); setTimerOn(true); }}>Start 90s</button>
        <button onClick={() => { setSecs(120); setTimerOn(true); }}>Start 120s</button>
        <button onClick={() => setTimerOn((v) => !v)}>{timerOn ? "Pause" : "Resume"}</button>
        <button onClick={() => { setTimerOn(false); setSecs(90); }}>Reset</button>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{Math.floor(secs/60)}:{String(secs%60).padStart(2,"0")}</div>
      </div>

      <p style={{ opacity: 0.75, marginTop: 10 }}>
        Phase 1.1 adds the full exercise + sets logger screen. The base is already offline-safe.
      </p>
    </div>
  );
}

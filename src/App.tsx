import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { enqueue, runSyncPass, startAutoSync } from "./sync";
import { pullSync } from "./pullSync";
import {
  localdb,
  type LocalMilestone,
  type LocalWorkoutExercise,
  type LocalWorkoutSession,
  type LocalWorkoutSet,
  type LocalWorkoutTemplate,
  type LocalWorkoutTemplateExercise
} from "./localdb";
import { exportFullBackup, importBackup, validateBackupEnvelope, type ImportMode } from "./utils/backup";
import DashboardView from "./components/DashboardView";
import QuickLogView from "./components/QuickLogView";
import WorkoutLoggerView from "./components/WorkoutLoggerView";
import ProgressView from "./components/ProgressView";
import ErrorBoundary from "./components/ErrorBoundary";
import { computeBrainSnapshot, type BrainSnapshot, type BrainFocus, type FocusCounts, type ExerciseHistory } from "./lib/brainEngine";

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

function addDays(day: string, delta: number): string {
  // day: YYYY-MM-DD
  const [y, m, d] = day.split("-").map((x) => Number(x));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}


// -----------------------------
// Exercise name normalization + aliases
// -----------------------------
function normalizeExerciseName(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .trim()
    .replace(/[_\-]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CANONICAL_DISPLAY: Record<string, string> = {
  bench_press: "Bench Press",
  incline_bench_press: "Incline Bench Press",
  dumbbell_bench_press: "DB Bench Press",
  overhead_press: "Overhead Press",
  deadlift: "Deadlift",
  romanian_deadlift: "Romanian Deadlift",
  barbell_row: "Barbell Row",
  chest_supported_row: "Chest Supported Row",
  seated_cable_row: "Seated Cable Row",
  lat_pulldown: "Lat Pulldown",
  pull_up: "Pull-Up",
  chin_up: "Chin-Up",
  squat: "Squat",
  ssb_squat: "SSB Squat",
  split_squat: "Split Squat",
  leg_press: "Leg Press",
  hack_squat: "Hack Squat",
  leg_extension: "Leg Extension",
  hamstring_curl: "Hamstring Curl",
  calf_raise: "Calf Raise",
  dip: "Dip",
  lateral_raise: "Lateral Raise",
  rear_delt_fly: "Rear Delt Fly",
  chest_fly: "Chest Fly",
  face_pull: "Face Pull",
  shrug: "Shrug",
  curl: "Curl",
  preacher_curl: "Preacher Curl",
  hammer_curl: "Hammer Curl",
  triceps_pressdown: "Triceps Pressdown",
  overhead_triceps_extension: "Overhead Triceps Extension",
  plank: "Plank",
  crunch: "Crunch"
};

const CANONICAL_ALIAS_KEYS: Record<string, string> = {
  // Bench / press family
  bp: "bench_press",
  bench: "bench_press",
  benchpress: "bench_press",
  barbellbench: "bench_press",
  barbellbenchpress: "bench_press",
  flatbench: "bench_press",
  flatbenchpress: "bench_press",
  bbbench: "bench_press",
  inclinebench: "incline_bench_press",
  inclinebenchpress: "incline_bench_press",
  inclinebarbellbench: "incline_bench_press",
  dbbench: "dumbbell_bench_press",
  dbbenchpress: "dumbbell_bench_press",
  dumbbellbench: "dumbbell_bench_press",
  dumbbellbenchpress: "dumbbell_bench_press",
  dbbp: "dumbbell_bench_press",
  ohp: "overhead_press",
  overheadpress: "overhead_press",
  militarypress: "overhead_press",

  // Pull / row family
  bentoverrow: "barbell_row",
  barbellrow: "barbell_row",
  bbrow: "barbell_row",
  chestsupportedrow: "chest_supported_row",
  chestsupportedrows: "chest_supported_row",
  seatedcablerow: "seated_cable_row",
  cablerow: "seated_cable_row",
  rowmachine: "seated_cable_row",
  pulldown: "lat_pulldown",
  latpulldown: "lat_pulldown",
  latpull: "lat_pulldown",
  pullup: "pull_up",
  pullups: "pull_up",
  chinup: "chin_up",
  chinups: "chin_up",

  // Deadlift / hinge family
  dl: "deadlift",
  deadlift: "deadlift",
  rdl: "romanian_deadlift",
  romaniandeadlift: "romanian_deadlift",

  // Squat / leg family
  squat: "squat",
  squats: "squat",
  ssbsquat: "ssb_squat",
  ssbsquats: "ssb_squat",
  safetysquatbar: "ssb_squat",
  safetysquatbarsquat: "ssb_squat",
  safetysquatbarsquats: "ssb_squat",
  splitsquat: "split_squat",
  splitsquats: "split_squat",
  bulgariansplitsquat: "split_squat",
  legpress: "leg_press",
  hacksquat: "hack_squat",
  legrxtension: "leg_extension",
  legextension: "leg_extension",
  hamstringcurl: "hamstring_curl",
  legcurl: "hamstring_curl",
  calfraise: "calf_raise",
  standingcalfraise: "calf_raise",
  seatedcalfraise: "calf_raise",

  // Isolation / accessory family
  dip: "dip",
  dips: "dip",
  lateralraise: "lateral_raise",
  lateralraises: "lateral_raise",
  reardeltfly: "rear_delt_fly",
  reardeltflyes: "rear_delt_fly",
  reardeltraise: "rear_delt_fly",
  fly: "chest_fly",
  flyes: "chest_fly",
  chestfly: "chest_fly",
  pecdeck: "chest_fly",
  facepull: "face_pull",
  shrug: "shrug",
  shrugs: "shrug",
  curl: "curl",
  curls: "curl",
  bicepcurl: "curl",
  preachersurl: "preacher_curl",
  preachercurl: "preacher_curl",
  hammercurl: "hammer_curl",
  tricepspressdown: "triceps_pressdown",
  pressdown: "triceps_pressdown",
  pushdown: "triceps_pressdown",
  overheadtricepsextension: "overhead_triceps_extension",
  overheadtricepextension: "overhead_triceps_extension",
  tricepsextension: "overhead_triceps_extension",
  plank: "plank",
  crunch: "crunch",
  crunches: "crunch"
};

// Stable canonical movement key used for history, trends, milestones, etc.
function exerciseKey(raw: string): string {
  const compact = normalizeExerciseName(raw).replace(/\s+/g, "");
  return CANONICAL_ALIAS_KEYS[compact] ?? compact;
}

// Display name (what the UI shows)
function displayExerciseName(raw: string): string {
  const k = exerciseKey(raw);
  return CANONICAL_DISPLAY[k] ?? raw;
}

// When the user types a known alias as the full exercise name, store the canonical display name.
// This prevents split histories like "RDL" vs "Romanian Deadlift".
function canonicalizeExerciseInput(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return trimmed;
  const k = exerciseKey(trimmed);
  return CANONICAL_DISPLAY[k] ?? trimmed;
}

function isBenchName(name: string): boolean {
  const k = exerciseKey(name);
  return k === "bench_press" || k === "incline_bench_press" || k === "dumbbell_bench_press";
}
function isSquatName(name: string): boolean {
  const k = exerciseKey(name);
  return k === "squat" || k === "ssb_squat" || k === "split_squat" || k === "hack_squat" || k === "leg_press";
}
function isDeadliftName(name: string): boolean {
  const k = exerciseKey(name);
  return k === "deadlift" || k === "romanian_deadlift";
}

type SetLite = {
  load_type?: "weight" | "band" | "bodyweight" | null;
  weight_lbs: number | null;
  band_level?: number | null;
  band_mode?: "assist" | "resist" | null;
  band_config?: string | null; // "single" | "doubled" | "combo:<secondary_level>"
  band_est_lbs?: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
};

type LastSetSummary = {
  source: "local" | "cloud";
  started_at: string;
  sets: SetLite[];
};

type ExerciseDraft = {
  loadType: "weight" | "band" | "bodyweight";
  weight: string; // used for loadType=weight
  bandLevel: string; // primary 1..5 when loadType=band
  bandLevel2: string; // optional secondary 1..5 when using combined bands
  bandMode: "assist" | "resist";
  bandConfig: "single" | "doubled" | "combined";
  bandEst: string; // optional override
  reps: string;
  rpe: string;
  warmup: boolean;
};

function parseBandConfig(config: string | null | undefined): { mode: "single" | "doubled" | "combined"; secondaryLevel: number | null } {
  const raw = String(config || "single");
  if (raw === "doubled") return { mode: "doubled", secondaryLevel: null };
  if (raw.startsWith("combo:")) {
    const lvl = Number(raw.split(":")[1] || "");
    return { mode: "combined", secondaryLevel: Number.isFinite(lvl) ? lvl : null };
  }
  return { mode: "single", secondaryLevel: null };
}

function buildBandConfig(mode: "single" | "doubled" | "combined", secondaryLevel: number | null): string {
  if (mode === "combined" && secondaryLevel && secondaryLevel >= 1 && secondaryLevel <= 5) {
    return `combo:${secondaryLevel}`;
  }
  if (mode === "doubled") return "doubled";
  return "single";
}

function estimateBandLoad(
  primaryLevel: number | null,
  config: string | null | undefined,
  overrideText: string | null | undefined,
  bandMap: Record<string, number>,
  comboFactor: number
): number | null {
  const override = overrideText != null && String(overrideText).trim() !== "" ? Number(overrideText) : null;
  if (override != null && Number.isFinite(override) && override > 0) return Math.round(override);

  if (!primaryLevel || primaryLevel < 1 || primaryLevel > 5) return null;

  const primary = bandMap[String(primaryLevel)];
  if (typeof primary !== "number" || !Number.isFinite(primary)) return null;

  const parsed = parseBandConfig(config);
  if (parsed.mode === "doubled") return Math.round(primary * 2);
  if (parsed.mode === "combined" && parsed.secondaryLevel != null) {
    const secondary = bandMap[String(parsed.secondaryLevel)];
    if (typeof secondary === "number" && Number.isFinite(secondary)) {
      return Math.round((primary + secondary) * comboFactor);
    }
  }
  return Math.round(primary);
}

function formatSet(s: SetLite) {
  const r = s.reps ?? "—";
  const wu = s.is_warmup ? " WU" : "";
  const rpe = s.rpe != null ? ` @${s.rpe}` : "";

  const lt = (s.load_type ?? "weight") as "weight" | "band" | "bodyweight";
  if (lt === "bodyweight") {
    return `BW x${r}${wu}${rpe}`;
  }
  if (lt === "band") {
    const lvl = s.band_level ?? "—";
    const parsed = parseBandConfig(s.band_config);
    const cfg =
      parsed.mode === "doubled"
        ? "D"
        : parsed.mode === "combined" && parsed.secondaryLevel
          ? `+${parsed.secondaryLevel}`
          : "S";
    const mode = s.band_mode === "assist" ? "A" : "R";
    const est =
      s.band_est_lbs != null
        ? Number(s.band_est_lbs)
        : estimateBandLoad(
            typeof s.band_level === "number" ? s.band_level : null,
            s.band_config,
            null,
            bandEquivMap,
            bandComboFactor
          );
    const estTxt = est != null ? `~${est}` : "";
    return `B${lvl}${cfg}${mode}${estTxt} x${r}${wu}${rpe}`;
  }

  const w = s.weight_lbs ?? "—";
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


// -----------------------------
// Simple SVG sparkline / line chart
export default function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("…");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [tab, setTab] = useState<"quick" | "workout" | "dash" | "progress">("quick");

  // Auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean>(() => window.location.pathname === "/reset-password");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Date
  const [selectedDayDate, setSelectedDayDate] = useState(todayISO());

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
  const [coachEnabled, setCoachEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("rebuild60:coachEnabled");
      if (v === "0") return false;
      if (v === "1") return true;
      return true;
    } catch {
      return true;
    }
  });



// Band equivalent lbs calibration (user editable)
const [bandEquivMap, setBandEquivMap] = useState<Record<string, number>>({
  "1": 10,
  "2": 20,
  "3": 30,
  "4": 40,
  "5": 50
});
const [bandComboFactor, setBandComboFactor] = useState<number>(1.1);
const bandEquivMapRef = useRef<Record<string, number>>(bandEquivMap);
const bandComboFactorRef = useRef<number>(bandComboFactor);
useEffect(() => {
  bandEquivMapRef.current = bandEquivMap;
}, [bandEquivMap]);
useEffect(() => {
  bandComboFactorRef.current = bandComboFactor;
}, [bandComboFactor]);

async function loadBandEquiv() {
  if (!userId) return;
  const row = await localdb.localSettings.get([userId, "band_equiv_v1"]);
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (parsed && typeof parsed === "object") {
        const next: Record<string, number> = { ...bandEquivMap };
        for (const k of ["1", "2", "3", "4", "5"]) {
          const v = (parsed as any)[k];
          if (typeof v === "number" && isFinite(v)) next[k] = v;
        }
        const factor = Number((parsed as any)?.comboFactor);
        if (Number.isFinite(factor) && factor >= 1 && factor <= 2) {
          setBandComboFactor(factor);
        }
        setBandEquivMap(next);
      }
    } catch {
      // ignore
    }
  }
}

async function saveBandEquiv(next: Record<string, number>, comboFactorOverride?: number) {
  if (!userId) return;
  const updatedAt = Date.now();
  const factor =
    typeof comboFactorOverride === "number" && Number.isFinite(comboFactorOverride)
      ? comboFactorOverride
      : bandComboFactorRef.current;

  await localdb.localSettings.put({
    user_id: userId,
    key: "band_equiv_v1",
    value: JSON.stringify({
      ...next,
      comboFactor: factor
    }),
    updatedAt
  });

  setBandEquivMap(next);
  if (typeof comboFactorOverride === "number" && Number.isFinite(comboFactorOverride)) {
    setBandComboFactor(comboFactorOverride);
  }
}

useEffect(() => {
  // load persisted band equivalence map for this user
  loadBandEquiv();
}, [userId]);

  // Per-exercise drafts
  const [draftByExerciseId, setDraftByExerciseId] = useState<Record<string, ExerciseDraft>>({});

  // Templates
  const [templates, setTemplates] = useState<LocalWorkoutTemplate[]>([]);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [templateExercises, setTemplateExercises] = useState<LocalWorkoutTemplateExercise[]>([]);

  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editTemplateDesc, setEditTemplateDesc] = useState("");
  const [newTemplateExerciseName, setNewTemplateExerciseName] = useState("");

  // Last numbers cache
  const [lastByExerciseName, setLastByExerciseName] = useState<Record<string, LastSetSummary | undefined>>({});

  // Backup/Restore
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  // Dashboard computed series
  const [dashBusy, setDashBusy] = useState(false);
  type WeeklyCoach = {
    thisWeekStart: string;
    thisWeekEnd: string;
    sessionsThis: number;
    sessionsPrev: number;
    tonnageThis: number;
    tonnagePrev: number;
    setsThis: number;
    setsPrev: number;
    benchBest?: number;
    squatBest?: number;
    dlBest?: number;
    coachLine: string;
  };

  const [weeklyCoach, setWeeklyCoach] = useState<WeeklyCoach | null>(null);

  type DashboardTimelineWeek = {
    start: string;
    end: string;
    label: string;
    sessions: number;
    sets: number;
    tonnage: number;
    topLift: string;
    dominantFocus: BrainFocus;
  };

  const [timelineWeeks, setTimelineWeeks] = useState<DashboardTimelineWeek[]>([]);
  const [brainSnapshot, setBrainSnapshot] = useState<BrainSnapshot | null>(null);

  type AiCoach = { text: string; ts: number; model: string };
  const [aiCoach, setAiCoach] = useState<AiCoach | null>(null);
  const [aiCoachBusy, setAiCoachBusy] = useState(false);
  const [aiCoachErr, setAiCoachErr] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<LocalMilestone[]>([]);

  const [tonnageSeries, setTonnageSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [setsSeries, setSetsSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [benchSeries, setBenchSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [squatSeries, setSquatSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [dlSeries, setDlSeries] = useState<{ xLabel: string; y: number }[]>([]);
  // Quick Log trend series (last 28 days)
  const [weightSeries, setWeightSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [waistSeries, setWaistSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [sleepSeries, setSleepSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [calSeries, setCalSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [proteinSeries, setProteinSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [z2Series, setZ2Series] = useState<{ xLabel: string; y: number }[]>([]);


  // -----------------------------
  // Auth boot + autosync
  // -----------------------------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
      setEmail(data.user?.email ?? "");
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      setUserId(session?.user?.id ?? null);
      setEmail(session?.user?.email ?? "");
      if (evt === "PASSWORD_RECOVERY") {
        setIsRecoveryMode(true);
      }
      if (evt === "SIGNED_OUT") {
        setIsRecoveryMode(window.location.pathname === "/reset-password");
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const stop = startAutoSync(setStatus, async () => {
      await refreshLocalUiFromDexie();
      setLastSyncedAt(new Date().toLocaleTimeString());
    });
    return stop;
  }, [userId, selectedDayDate, openSessionId, tab]);

  useEffect(() => {
    if (!userId) return;
    void runSyncPass(setStatus, async () => {
      await refreshLocalUiFromDexie();
      setLastSyncedAt(new Date().toLocaleTimeString());
    });
  }, [userId, selectedDayDate]);

  useEffect(() => {
    if (!userId) return;
    void loadBandEquiv();
  }, [userId]);


  // AI Coach Add-on: load cached weekly AI coach from localStorage
  useEffect(() => {
    if (!userId || !weeklyCoach) return;
    const key = `aiCoach:${userId}:${weeklyCoach.thisWeekStart}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setAiCoach(null);
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.text === "string") setAiCoach(parsed);
      else setAiCoach(null);
    } catch {
      setAiCoach(null);
    }
  }, [userId, weeklyCoach?.thisWeekStart]);


  // Timer tick
  useEffect(() => {
    if (!timerOn) return;
    const t = window.setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [timerOn]);


  async function resetPassword() {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      alert("Enter your email first, then click Reset Password.");
      return;
    }

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });

    if (error) alert(error.message);
    else alert(`Password reset email sent if that account exists. It should return to: ${redirectTo}`);
  }

  async function finishPasswordReset() {
    if (!newPassword.trim()) {
      alert("Enter a new password.");
      return;
    }
    if (newPassword.length < 8) {
      alert("Use at least 8 characters for the new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      alert(error.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setIsRecoveryMode(false);
    window.history.replaceState({}, "", "/");
    alert("Password updated. You can now sign in with the new password.");
  }

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
    setIsRecoveryMode(false);
    window.history.replaceState({}, "", "/");
    setTab("quick");
    setOpenSessionId(null);
    setOpenTemplateId(null);
    setLastByExerciseName({});
    setDraftByExerciseId({});
  }

  // -----------------------------
  // Backup / Restore
  // -----------------------------
    async function exportBackup() {
    try {
      setBackupBusy(true);

      const envelope = await exportFullBackup(localdb);

      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `rebuild60-backup-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      alert("Backup exported. Save that file somewhere safe.");
    } catch (e: any) {
      console.error(e);
      alert(`Backup export failed: ${e?.message ?? String(e)}`);
    } finally {
      setBackupBusy(false);
    }
  }

    async function importBackupFile(file: File) {
    try {
      setBackupBusy(true);

      const text = await file.text();
      const parsed = validateBackupEnvelope(JSON.parse(text));

      const modeRaw = (prompt(
        "Import mode:\n\n• Type MERGE (recommended) to safely merge into this device.\n• Type REPLACE to WIPE this device and restore from backup.\n\nMode:",
        "MERGE"
      ) || "MERGE").trim().toUpperCase();

      if (modeRaw !== "MERGE" && modeRaw !== "REPLACE") {
        alert("Import cancelled (invalid mode).");
        return;
      }

      const mode = modeRaw as ImportMode;

      if (mode === "REPLACE") {
        const ok = confirm(
          "REPLACE will DELETE your local data on this device, then restore from the backup.\n\nIf you're not 100% sure, hit Cancel.\n\nContinue?"
        );
        if (!ok) return;

        const typed = (prompt('Type REPLACE to confirm destructive restore:', '') || '').trim().toUpperCase();
        if (typed !== "REPLACE") {
          alert("Import cancelled.");
          return;
        }
      }

      const result = await importBackup(localdb, parsed, mode);

      setLastByExerciseName({});
      setDraftByExerciseId({});
      setOpenSessionId(null);
      setOpenTemplateId(null);

      if (userId) {
        await loadSessionsForDay(selectedDayDate);
        await loadTemplates();
      }

      alert(
        `Restore complete (${mode}).\n\nInserted: ${result.inserted}\nUpdated: ${result.updated}\nSkipped: ${result.skipped}\n\nTip: Keep the app online to sync any pending offline items.`
      );
    } catch (e: any) {
      console.error(e);
      alert(`Restore failed: ${e?.message ?? String(e)}`);
    } finally {
      setBackupBusy(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  // -----------------------------
  // Quick Log save (offline-safe)
  // -----------------------------
  
  async function refreshAiCoach(force = false) {
    if (!userId || !weeklyCoach) return;
    setAiCoachErr(null);

    const key = `aiCoach:${userId}:${weeklyCoach.thisWeekStart}`;
    const lastKey = key + ":last";
    const now = Date.now();
    const last = Number(localStorage.getItem(lastKey) || "0");
    const sixHours = 6 * 60 * 60 * 1000;
    if (!force && last && now - last < sixHours) {
      setAiCoachErr("AI Coach is rate-limited (6h). Use Force Refresh if you really need it.");
      return;
    }

    setAiCoachBusy(true);
    try {

      // Always pull latest Quick Log snapshot(s) from Dexie (source of truth for offline-first)
      // Include a short recent window so the AI can see trends without hallucinating.
      const recentDays = 14;
      const startDay = addDays(selectedDayDate, -(recentDays - 1));
      const dayList: string[] = [];
      for (let i = 0; i < recentDays; i++) dayList.push(addDays(startDay, i));

      const quickRecent = await Promise.all(
        dayList.map(async (day) => {
          const [d, n, z] = await Promise.all([
            localdb.dailyMetrics.get([userId, day]),
            localdb.nutritionDaily.get([userId, day]),
            localdb.zone2Daily.get([userId, day])
          ]);
          return {
            day_date: day,
            weight_lbs: (d as any)?.weight_lbs ?? null,
            waist_in: (d as any)?.waist_in ?? null,
            sleep_hours: (d as any)?.sleep_hours ?? null,
            calories: (n as any)?.calories ?? null,
            protein_g: (n as any)?.protein_g ?? null,
            zone2_minutes: (z as any)?.minutes ?? null,
            notes: (d as any)?.notes ?? null
          };
        })
      );

      const qToday = quickRecent.find((x) => x.day_date === selectedDayDate) || {
        day_date: selectedDayDate,
        weight_lbs: null,
        waist_in: null,
        sleep_hours: null,
        calories: null,
        protein_g: null,
        zone2_minutes: null,
        notes: null
      };

      // Recent workout snapshots (compact): last up to 6 sessions.
      // IMPORTANT: some sessions may not have day_date populated (or it may be inconsistent).
      // Select by started_at primarily, and only use day_date as a best-effort filter.
      const allSessions = await localdb.localSessions
        .where("user_id")
        .equals(userId)
        .sortBy("started_at");

      const inWindow = (allSessions || []).filter((s) => {
        const dd = (s as any).day_date as string | undefined | null;
        const started = (s as any).started_at as string | undefined | null;
        const derived = (typeof dd === "string" && dd)
          ? dd
          : (typeof started === "string" && started.length >= 10 ? started.slice(0, 10) : "");
        if (!derived) return true; // if we truly can't derive, keep it (better than 'no workouts')
        return derived >= startDay && derived <= selectedDayDate;
      });

      const recentSessions = inWindow.slice(-6).reverse();

      const recent_workouts = [] as any[];
      for (const s of recentSessions) {
        const ex = await localdb.localExercises.where({ session_id: s.id }).sortBy("sort_order");
        const exSummaries: any[] = [];
        for (const e of (ex || []).slice(0, 12)) {
          const ss = await localdb.localSets.where({ exercise_id: e.id }).sortBy("set_number");
          const work = (ss || []).filter((x) => !x.is_warmup && typeof x.reps === "number" && (x.reps as any) > 0);
          // pick best set by Epley 1RM using est load
          let best: any = null;
          for (const st of work) {
            const reps = Number((st as any).reps || 0);
            let load = null as any;
            const lt = ((st as any).load_type || "weight") as string;
            if (lt === "band") load = (st as any).band_est_lbs ?? (st as any).weight_lbs ?? null;
            else if (lt === "bodyweight") load = (st as any).weight_lbs ?? (st as any).band_est_lbs ?? null; // best-effort
            else load = (st as any).weight_lbs ?? (st as any).band_est_lbs ?? null;
            if (load == null || !isFinite(Number(load)) || Number(load) <= 0) continue;
            const score = oneRmEpley(Number(load), reps);
            if (!best || score > best.score) {
              best = {
                score,
                load_type: lt,
                weight_lbs: (st as any).weight_lbs ?? null,
                band_level: (st as any).band_level ?? null,
                band_mode: (st as any).band_mode ?? null,
                band_config: (st as any).band_config ?? null,
                band_est_lbs: (st as any).band_est_lbs ?? null,
                reps,
                rpe: (st as any).rpe ?? null
              };
            }
          }
          exSummaries.push({ name: e.name, best_set: best });
        }

        const dd = (s as any).day_date as any;
        const started = (s as any).started_at as any;
        const derivedDay = (typeof dd === "string" && dd)
          ? dd
          : (typeof started === "string" && started.length >= 10 ? started.slice(0, 10) : null);

        recent_workouts.push({
          id: s.id,
          day_date: derivedDay,
          started_at: s.started_at,
          title: s.title,
          notes: s.notes ?? null,
          exercises: exSummaries
        });
      }

      const payload = {
        user_id: userId,
        week: {
          start: weeklyCoach.thisWeekStart,
          end: weeklyCoach.thisWeekEnd
        },
        coach_core: weeklyCoach,
        quick_log_today: qToday,
        quick_log_recent: quickRecent,
        recent_workouts
      };

      const resp = await fetch("/.netlify/functions/coach-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || `AI coach error (${resp.status})`);
      }

      const ai: AiCoach = { text: String(data.text || ""), ts: Number(data.ts || Date.now()), model: String(data.model || "gpt-5.2") };
      setAiCoach(ai);
      localStorage.setItem(key, JSON.stringify(ai));
      localStorage.setItem(lastKey, String(now));
    } catch (e: any) {
      setAiCoachErr(e?.message || "AI coach failed.");
    } finally {
      setAiCoachBusy(false);
    }
  }


async function saveQuickLog() {
    if (!userId) return;

    const day = selectedDayDate;
    const nowIso = new Date().toISOString();

    // 1) Local-first: overwrite the ONE daily snapshot for this day.
    // Use a transaction so Dashboard trends can never see a half-updated state.
    await localdb.transaction('rw', localdb.dailyMetrics, localdb.nutritionDaily, localdb.zone2Daily, async () => {
      await localdb.dailyMetrics.put({
        user_id: userId,
        day_date: day,
        weight_lbs: weight ? Number(weight) : null,
        waist_in: waist ? Number(waist) : null,
        sleep_hours: sleepHours ? Number(sleepHours) : null,
        notes: notes || null,
        updatedAt: nowIso
      } as any);

      await localdb.nutritionDaily.put({
        user_id: userId,
        day_date: day,
        calories: calories ? Number(calories) : null,
        protein_g: protein ? Number(protein) : null,
        updatedAt: nowIso
      } as any);

      if (z2Minutes && String(z2Minutes).trim() !== "") {
        await localdb.zone2Daily.put({
          user_id: userId,
          day_date: day,
          modality: "Walk",
          minutes: Number(z2Minutes),
          updatedAt: nowIso
        } as any);
      } else {
        // If user clears Zone 2, reflect that locally.
        await localdb.zone2Daily.delete([userId, day]);
      }
    });

    // 2) Queue cloud sync ops (best-effort). Even if this fails, local is already correct.
    try {
      await enqueue("upsert_daily", {
        user_id: userId,
        day_date: day,
        weight_lbs: weight ? Number(weight) : null,
        waist_in: waist ? Number(waist) : null,
        sleep_hours: sleepHours ? Number(sleepHours) : null,
        notes: notes || null
      });

      await enqueue("upsert_nutrition", {
        user_id: userId,
        day_date: day,
        calories: calories ? Number(calories) : null,
        protein_g: protein ? Number(protein) : null
      });

      if (z2Minutes && String(z2Minutes).trim() !== "") {
        await enqueue("insert_zone2", {
          user_id: userId,
          day_date: day,
          modality: "Walk",
          minutes: Number(z2Minutes)
        });
      } else {
        // Optional: if you want clearing Zone 2 to delete in Supabase too, we can add a delete op.
        // For now, keep it simple: local reflects cleared; cloud will update next time you write a value.
      }
    } catch (e) {
      console.warn("Quick Log saved locally, but queueing sync ops failed:", e);
    }

    // 3) Force UI to re-read local data and refresh Dashboard trend series.
    try {
      await refreshDashboard();
    } catch (e) {
      console.warn("refreshDashboard failed after Quick Log save:", e);
    }

    alert(`Saved for ${day}. (Local-first) Will sync when online.`);
  }

  // -----------------------------
  // Workout: local-first helpers
  // -----------------------------
  async function loadSessionsForDay(day: string) {
    if (!userId) return;
    const rows = await localdb.localSessions
      .where({ user_id: userId, day_date: day })
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

    setDraftByExerciseId((prev) => {
      const next = { ...prev };
      for (const e of ex) {
        if (!next[e.id]) next[e.id] = { loadType: "weight", weight: "", bandLevel: "3", bandLevel2: "", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false };
      }
      return next;
    });
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
      day_date: selectedDayDate,
      started_at,
      title: "Week 1 Day 1",
      notes: null
    };

    await localdb.localSessions.put(local);

    await enqueue("create_workout", {
      id,
      user_id: userId,
      day_date: selectedDayDate,
      started_at,
      title: local.title,
      notes: null
    });

    await loadSessionsForDay(selectedDayDate);
    await openSession(id);
    setTab("workout");
  }

  function updateDraft(exerciseId: string, patch: Partial<ExerciseDraft>) {
    setDraftByExerciseId((prev) => ({
      ...prev,
      [exerciseId]: { ...(prev[exerciseId] ?? { loadType: "weight", weight: "", bandLevel: "3", bandLevel2: "", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false }), ...patch }
    }));
  }

  async function addExercise() {
    if (!openSessionId) return;

    const name = canonicalizeExerciseInput(newExerciseName);
    if (!name.trim()) return;

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
      [id]: prev[id] ?? { loadType: "weight", weight: "", bandLevel: "3", bandLevel2: "", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false }
    }));

    await openSession(openSessionId);

    await ensureLastForExerciseName(name);
    applyDefaultAutofill(id, name);
  }

  
async function addSet(exerciseId: string) {
  const d =
    draftByExerciseId[exerciseId] ??
    { loadType: "weight", weight: "", bandLevel: "3", bandLevel2: "", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false };

  const reps = d.reps ? Number(d.reps) : null;
  if (!reps || reps <= 0) {
    alert("Reps required.");
    return;
  }

  const loadType = d.loadType || "weight";

  let weight_lbs: number | null = null;
  let band_level: number | null = null;
  let band_mode: "assist" | "resist" | null = null;
  let band_config: string | null = null;
  let band_est_lbs: number | null = null;

  if (loadType === "weight") {
    const w = d.weight ? Number(d.weight) : null;
    if (!w || w <= 0) {
      alert("Weight required (or switch to Band/BW).");
      return;
    }
    weight_lbs = w;
  } else if (loadType === "band") {
    const lvl = d.bandLevel ? Number(d.bandLevel) : null;
    if (!lvl || lvl < 1 || lvl > 5) {
      alert("Primary band level (1–5) required.");
      return;
    }
    band_level = lvl;
    band_mode = d.bandMode || "resist";

    const secondaryLvl = d.bandLevel2 ? Number(d.bandLevel2) : null;
    if (d.bandConfig === "combined" && (!secondaryLvl || secondaryLvl < 1 || secondaryLvl > 5)) {
      alert("Second band level (1–5) required for combined bands.");
      return;
    }

    band_config = buildBandConfig(
      d.bandConfig || "single",
      secondaryLvl && secondaryLvl >= 1 && secondaryLvl <= 5 ? secondaryLvl : null
    );

    band_est_lbs = estimateBandLoad(lvl, band_config, d.bandEst, bandEquivMap, bandComboFactor);
    if (band_est_lbs == null) {
      alert("Could not estimate band load. Enter an override or check band settings.");
      return;
    }
  } else {
    weight_lbs = null;
  }

  const existing = await localdb.localSets.where({ exercise_id: exerciseId }).toArray();
  const nextSetNumber = (existing?.length ?? 0) + 1;

  const id = uuid();
  const local: LocalWorkoutSet = {
    id,
    exercise_id: exerciseId,
    set_number: nextSetNumber,
    load_type: loadType as any,
    weight_lbs,
    band_level,
    band_mode,
    band_config,
    band_est_lbs,
    reps,
    rpe: advanced && d.rpe ? Number(d.rpe) : null,
    is_warmup: advanced ? !!d.warmup : false
  };

  await localdb.localSets.put(local);
  setSets((prev) => [...prev, local].sort((a, b) => a.set_number - b.set_number));

  await enqueue("insert_set", {
    id,
    exercise_id: exerciseId,
    set_number: nextSetNumber,
    load_type: loadType,
    weight_lbs,
    band_level,
    band_mode,
    band_config,
    band_est_lbs,
    reps,
    rpe: advanced && d.rpe ? Number(d.rpe) : null,
    is_warmup: advanced ? !!d.warmup : false
  });

  updateDraft(exerciseId, {
    weight: loadType === "weight" ? "" : d.weight,
    bandEst: loadType === "band" ? "" : d.bandEst,
    reps: "",
    rpe: "",
    warmup: false
  });

  setSecs(90);
  setTimerOn(true);

  const ex = exercises.find((e) => e.id === exerciseId);
  if (ex) {
    setLastByExerciseName((prev) => {
      const k = exerciseKey(ex.name);
      const prevSummary = prev[k];
      const appended: SetLite = {
        load_type: loadType,
        weight_lbs: weight_lbs ?? null,
        band_level,
        band_mode,
        band_config,
        band_est_lbs,
        reps: reps ?? null,
        rpe: advanced && d.rpe ? Number(d.rpe) : null,
        is_warmup: advanced ? !!d.warmup : false
      };
      return {
        ...prev,
        [k]: {
          source: "local",
          started_at: new Date().toISOString(),
          sets: prevSummary?.sets ? [...prevSummary.sets, appended] : [appended]
        }
      };
    });
  }

  if (openSessionId) await openSession(openSessionId);
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

      await loadSessionsForDay(selectedDayDate);
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
    const t = await localdb.localTemplates.get(templateId);
    setEditTemplateName(t?.name ?? "");
    setEditTemplateDesc(t?.description ?? "");
    const ex = await localdb.localTemplateExercises.where({ template_id: templateId }).sortBy("sort_order");
    setTemplateExercises(ex);
  }


  async function deleteTemplate(templateId: string) {
    if (!userId) return;

    const t = templates.find((x) => x.id === templateId);
    const label = t ? `"${t.name}"` : "this template";
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

    // Local-first delete
    await localdb.transaction("rw", localdb.localTemplates, localdb.localTemplateExercises, async () => {
      await localdb.localTemplateExercises.where({ template_id: templateId }).delete();
      await localdb.localTemplates.delete(templateId);
    });

    // UI state
    if (openTemplateId === templateId) {
      setOpenTemplateId(null);
      setTemplateExercises([]);
    }
    await loadTemplates();

    // Queue cloud delete (best-effort)
    try {
      await enqueue("delete_template", { user_id: userId, template_id: templateId });
    } catch (e) {
      console.warn("Failed to enqueue delete_template:", e);
    }
  }


async function saveTemplateMeta() {
  if (!userId || !openTemplateId) return;
  const name = editTemplateName.trim();
  if (!name) {
    alert("Template name required.");
    return;
  }

  const current = await localdb.localTemplates.get(openTemplateId);
  const updated: LocalWorkoutTemplate = {
    id: openTemplateId,
    user_id: userId,
    name,
    description: editTemplateDesc.trim() || null,
    created_at: current?.created_at ?? new Date().toISOString()
  };

  await localdb.localTemplates.put(updated);
  await enqueue("update_template", updated);
  await loadTemplates();
  await openTemplate(openTemplateId);
}

async function renameTemplateExercise(templateExerciseId: string, rawName: string) {
  if (!openTemplateId) return;
  const name = canonicalizeExerciseInput(rawName).trim();
  if (!name) return;

  const current = templateExercises.find((x) => x.id === templateExerciseId);
  if (!current) return;

  const updated: LocalWorkoutTemplateExercise = { ...current, name };
  await localdb.localTemplateExercises.put(updated);
  setTemplateExercises((prev) => prev.map((x) => (x.id === templateExerciseId ? updated : x)));
  await enqueue("update_template_exercise", updated);
}

async function deleteTemplateExercise(templateExerciseId: string) {
  if (!openTemplateId) return;
  const remaining = templateExercises
    .filter((x) => x.id !== templateExerciseId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((x, i) => ({ ...x, sort_order: i }));

  await localdb.transaction("rw", localdb.localTemplateExercises, async () => {
    await localdb.localTemplateExercises.delete(templateExerciseId);
    for (const row of remaining) {
      await localdb.localTemplateExercises.put(row);
    }
  });

  setTemplateExercises(remaining);
  await enqueue("delete_template_exercise", { template_exercise_id: templateExerciseId });
  await enqueue("reorder_template_exercises", {
    ordered_template_exercise_ids: remaining.map((x) => x.id)
  });
}

async function moveTemplateExercise(templateExerciseId: string, direction: -1 | 1) {
  if (!openTemplateId) return;
  const ordered = templateExercises.slice().sort((a, b) => a.sort_order - b.sort_order);
  const idx = ordered.findIndex((x) => x.id === templateExerciseId);
  if (idx < 0) return;
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= ordered.length) return;

  const copy = ordered.slice();
  [copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]];
  const renumbered = copy.map((x, i) => ({ ...x, sort_order: i }));

  await localdb.transaction("rw", localdb.localTemplateExercises, async () => {
    for (const row of renumbered) {
      await localdb.localTemplateExercises.put(row);
    }
  });

  setTemplateExercises(renumbered);
  await enqueue("reorder_template_exercises", {
    ordered_template_exercise_ids: renumbered.map((x) => x.id)
  });
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
    const name = canonicalizeExerciseInput(newTemplateExerciseName);
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
      day_date: selectedDayDate,
      started_at,
      title: t.name,
      notes: null
    };

    await localdb.localSessions.put(localSession);

    await enqueue("create_workout", {
      id: sessionId,
      user_id: userId,
      day_date: selectedDayDate,
      started_at,
      title: t.name,
      notes: null
    });

    for (let i = 0; i < ex.length; i++) {
      const te = ex[i];
      const exerciseId = uuid();

      const canonicalName = canonicalizeExerciseInput(te.name);

      const localExercise: LocalWorkoutExercise = {
        id: exerciseId,
        session_id: sessionId,
        name: canonicalName,
        sort_order: i
      };

      await localdb.localExercises.put(localExercise);

      await enqueue("insert_exercise", {
        id: exerciseId,
        session_id: sessionId,
        name: canonicalName,
        sort_order: i
      });

      setDraftByExerciseId((prev) => ({
        ...prev,
        [exerciseId]: prev[exerciseId] ?? { loadType: "weight", weight: "", bandLevel: "3", bandLevel2: "", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false }
      }));
    }

    await loadSessionsForDay(selectedDayDate);
    await openSession(sessionId);
    setTab("workout");
    alert("Session created from template (instant).");
  }

  // -----------------------------
  // Last numbers
  // -----------------------------
  async function getLocalLastForExerciseName(exName: string, excludeSessionId: string | null): Promise<LastSetSummary | null> {
    const k = exerciseKey(exName);
    const allExercises = await localdb.localExercises.toArray();
    const matches = allExercises.filter((e) => exerciseKey(e.name) === k && e.session_id !== excludeSessionId);
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
      load_type: (x as any).load_type ?? null,
      weight_lbs: x.weight_lbs ?? null,
      band_level: (x as any).band_level ?? null,
      band_mode: (x as any).band_mode ?? null,
      band_config: (x as any).band_config ?? null,
      band_est_lbs: (x as any).band_est_lbs ?? null,
      reps: x.reps ?? null,
      rpe: x.rpe ?? null,
      is_warmup: !!x.is_warmup
    }));

    return { source: "local", started_at: best.started_at, sets: all };
  }

  async function getCloudLastForExerciseName(exName: string): Promise<LastSetSummary | null> {
    if (!userId) return null;
    if (!navigator.onLine) return null;

    const k = exerciseKey(exName);

    const { data: sess, error: sessErr } = await supabase
      .from("workout_sessions")
      .select("id, started_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(30);

    if (sessErr || !sess || sess.length === 0) return null;

    const sessionIds = sess.map((s) => s.id);

    // Pull exercises for recent sessions and filter client-side by alias key.
    const { data: ex, error: exErr } = await supabase
      .from("workout_exercises")
      .select("id, session_id, name")
      .in("session_id", sessionIds);

    if (exErr || !ex || ex.length === 0) return null;

    const matches = ex.filter((e: any) => exerciseKey(String(e.name || "")) === k);
    if (matches.length === 0) return null;

    // Choose the most recent session in sess ordering
    const sessionRank = new Map<string, number>();
    sess.forEach((s, idx) => sessionRank.set(s.id, idx));

    let best = matches[0];
    for (const e of matches) {
      const rBest = sessionRank.get(best.session_id) ?? 9999;
      const rE = sessionRank.get(e.session_id) ?? 9999;
      if (rE < rBest) best = e;
    }

    const started_at = (sess.find((s) => s.id === best.session_id)?.started_at as string) ?? new Date().toISOString();

    const { data: ss, error: ssErr } = await supabase
      .from("workout_sets")
      .select("load_type, weight_lbs, band_level, band_mode, band_config, band_est_lbs, reps, rpe, is_warmup, set_number")
      .eq("exercise_id", best.id)
      .order("set_number", { ascending: true });

    if (ssErr || !ss || ss.length === 0) return null;

    const all = ss.map((x: any) => ({
      load_type: x.load_type ?? null,
      weight_lbs: x.weight_lbs ?? null,
      band_level: x.band_level ?? null,
      band_mode: x.band_mode ?? null,
      band_config: x.band_config ?? null,
      band_est_lbs: x.band_est_lbs ?? null,
      reps: x.reps ?? null,
      rpe: x.rpe ?? null,
      is_warmup: !!x.is_warmup
    }));

    return { source: "cloud", started_at, sets: all };
  }

  async function ensureLastForExerciseName(exName: string) {
    const k = exerciseKey(exName);
    if (lastByExerciseName[k]) return;

    const local = await getLocalLastForExerciseName(exName, openSessionId);
    if (local) {
      setLastByExerciseName((prev) => ({ ...prev, [k]: local }));
      return;
    }

    const cloud = await getCloudLastForExerciseName(exName);
    if (cloud) {
      setLastByExerciseName((prev) => ({ ...prev, [k]: cloud }));
      return;
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

  
function effectiveLoadForTopSet(s: SetLite): number {
  const lt = s.load_type ?? "weight";
  if (lt === "weight") return Number(s.weight_lbs ?? -1);
  if (lt === "band") return Number(s.band_est_lbs ?? -1);
  // bodyweight: treat as 0 so it doesn't beat loaded sets
  return 0;
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
    const summary = lastByExerciseName[exerciseKey(exName)];
    if (!summary || summary.sets.length === 0) return;

    const existing = draftByExerciseId[exerciseId];
    if (existing && (existing.weight || existing.reps)) return;

    const compound = isCompoundExercise(exName);
    const chosen = compound ? pickFirstWorkSet(summary.sets) : pickTopSet(summary.sets);
    if (!chosen) return;

    const parsedBand = parseBandConfig((chosen.band_config as any) ?? "single");
    updateDraft(exerciseId, {
      loadType: (chosen.load_type as any) ?? "weight",
      weight: chosen.weight_lbs != null ? String(chosen.weight_lbs) : "",
      bandLevel: chosen.band_level != null ? String(chosen.band_level) : "",
      bandLevel2: parsedBand.secondaryLevel != null ? String(parsedBand.secondaryLevel) : "",
      bandMode: (chosen.band_mode as any) ?? "resist",
      bandConfig: parsedBand.mode,
      bandEst: chosen.band_est_lbs != null ? String(chosen.band_est_lbs) : "",
      reps: chosen.reps != null ? String(chosen.reps) : "",
      rpe: chosen.rpe != null ? String(chosen.rpe) : "",
      warmup: !!chosen.is_warmup
    });
  }

  function applyLastModeToDraft(exerciseId: string, exName: string, mode: "last" | "top" | "firstWork") {
    const summary = lastByExerciseName[exerciseKey(exName)];
    if (!summary || summary.sets.length === 0) return;

    const chosen =
      mode === "last"
        ? pickLastSet(summary.sets)
        : mode === "top"
          ? pickTopSet(summary.sets)
          : pickFirstWorkSet(summary.sets);

    if (!chosen) return;

    const parsedBand = parseBandConfig((chosen.band_config as any) ?? "single");
    updateDraft(exerciseId, {
      loadType: (chosen.load_type as any) ?? "weight",
      weight: chosen.weight_lbs != null ? String(chosen.weight_lbs) : "",
      bandLevel: chosen.band_level != null ? String(chosen.band_level) : "",
      bandLevel2: parsedBand.secondaryLevel != null ? String(parsedBand.secondaryLevel) : "",
      bandMode: (chosen.band_mode as any) ?? "resist",
      bandConfig: parsedBand.mode,
      bandEst: chosen.band_est_lbs != null ? String(chosen.band_est_lbs) : "",
      reps: chosen.reps != null ? String(chosen.reps) : "",
      rpe: chosen.rpe != null ? String(chosen.rpe) : "",
      warmup: !!chosen.is_warmup
    });
  }

async function loadQuickLogForDay(day: string) {
  if (!userId) return;

  const [d, n, z] = await Promise.all([
    localdb.dailyMetrics.get([userId, day]),
    localdb.nutritionDaily.get([userId, day]),
    localdb.zone2Daily.get([userId, day])
  ]);

  setWeight(d?.weight_lbs != null ? String(d.weight_lbs) : "");
  setWaist(d?.waist_in != null ? String(d.waist_in) : "");
  setSleepHours(d?.sleep_hours != null ? String(d.sleep_hours) : "");
  setCalories(n?.calories != null ? String(n.calories) : "");
  setProtein(n?.protein_g != null ? String(n.protein_g) : "");
  setZ2Minutes(z?.minutes != null ? String(z.minutes) : "");
  setNotes(d?.notes ?? "");
}

  // -----------------------------
  // Dashboard computations (local, offline)
  // -----------------------------
  

async function persistDetectedMilestones(args: {
  userId: string;
  benchSeries: { xLabel: string; y: number }[];
  squatSeries: { xLabel: string; y: number }[];
  dlSeries: { xLabel: string; y: number }[];
  trainingDays28: number;
}) {
  const { userId, benchSeries, squatSeries, dlSeries, trainingDays28 } = args;
  const existing = await localdb.localMilestones.where("user_id").equals(userId).toArray();
  const existingIds = new Set(existing.map((m) => m.id));
  const now = Date.now();

  type Candidate = LocalMilestone;
  const candidates: Candidate[] = [];

  const lifts = [
    { key: "bench_press", name: "Bench Press", series: benchSeries, thresholds: [135, 185, 225, 275, 315] },
    { key: "squat", name: "Squat", series: squatSeries, thresholds: [185, 225, 275, 315, 365, 405] },
    { key: "deadlift", name: "Deadlift", series: dlSeries, thresholds: [225, 275, 315, 365, 405, 455] },
  ];

  for (const lift of lifts) {
    if (!lift.series || lift.series.length === 0) continue;
    const best = Math.max(...lift.series.map((p) => Number(p.y) || 0));
    if (best > 0) {
      const rounded = Math.round(best);
      const prId = `${userId}:pr:${lift.key}:${rounded}`;
      candidates.push({
        id: prId,
        user_id: userId,
        milestone_type: "pr",
        code: `pr:${lift.key}:${rounded}`,
        label: `New ${lift.name} PR — ${rounded} e1RM`,
        achieved_on: todayISO(),
        createdAt: now
      });
    }

    for (const t of lift.thresholds) {
      if (best >= t) {
        const thresholdId = `${userId}:threshold:${lift.key}:${t}`;
        candidates.push({
          id: thresholdId,
          user_id: userId,
          milestone_type: "threshold",
          code: `threshold:${lift.key}:${t}`,
          label: `Crossed ${t} ${lift.name}`,
          achieved_on: todayISO(),
          createdAt: now
        });
      }
    }
  }

  if (trainingDays28 >= 20) {
    const id = `${userId}:consistency:20-days-28`;
    candidates.push({
      id,
      user_id: userId,
      milestone_type: "consistency",
      code: "consistency:20-days-28",
      label: "20 Training Days in 28 Days",
      achieved_on: todayISO(),
      createdAt: now
    });
  }

  const fresh = candidates.filter((c) => !existingIds.has(c.id));
  if (fresh.length > 0) {
    await localdb.localMilestones.bulkPut(fresh);
  }

  const all = await localdb.localMilestones.where("user_id").equals(userId).toArray();
  all.sort((a, b) => {
    if (a.achieved_on === b.achieved_on) return b.createdAt - a.createdAt;
    return a.achieved_on < b.achieved_on ? 1 : -1;
  });
  setMilestones(all.slice(0, 8));
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetweenISO(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function focusFromExerciseKey(k: string): BrainFocus {
  if ([
    "bench_press", "incline_bench_press", "dumbbell_bench_press", "overhead_press",
    "dip", "lateral_raise", "chest_fly", "triceps_pressdown", "overhead_triceps_extension"
  ].includes(k)) return "Push";

  if ([
    "barbell_row", "chest_supported_row", "seated_cable_row", "lat_pulldown", "pull_up",
    "chin_up", "rear_delt_fly", "face_pull", "shrug", "curl", "preacher_curl", "hammer_curl"
  ].includes(k)) return "Pull";

  if ([
    "deadlift", "romanian_deadlift", "squat", "ssb_squat", "split_squat", "leg_press",
    "hack_squat", "leg_extension", "hamstring_curl", "calf_raise", "plank", "crunch"
  ].includes(k)) return "Lower";

  return "Mixed";
}

function dominantFocusFromCounts(counts: FocusCounts): BrainFocus {
  const entries: Array<[BrainFocus, number]> = [
    ["Push", counts.Push],
    ["Pull", counts.Pull],
    ["Lower", counts.Lower],
    ["Mixed", counts.Mixed]
  ];
  entries.sort((a, b) => b[1] - a[1]);
  if (entries[0][1] === 0) return "Mixed";
  if (entries[1][1] === entries[0][1]) return "Mixed";
  return entries[0][0];
}

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

        const effectiveLoad = Number(s.weight_lbs ?? s.band_est_lbs ?? 0);
        const r = s.reps ?? 0;
        if (effectiveLoad > 0 && r > 0) {
          tonnageByDay.set(day, (tonnageByDay.get(day) ?? 0) + effectiveLoad * r);

          // e1RM (best per day) for bucketed names
          const e1 = oneRmEpley(effectiveLoad, r);

          if (isBenchName(info.name)) bumpMax(bestBenchE1RM, day, e1);
          if (isSquatName(info.name)) bumpMax(bestSquatE1RM, day, e1);
          if (isDeadliftName(info.name)) bumpMax(bestDlE1RM, day, e1);
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

      // Weekly coach summary: compare last 7 days vs prior 7 days
      const fmt = (d: Date) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      };

      const endDay = new Date(end);
      const startThis = new Date(endDay);
      startThis.setDate(endDay.getDate() - 6);
      const startPrev = new Date(endDay);
      startPrev.setDate(endDay.getDate() - 13);
      const endPrev = new Date(endDay);
      endPrev.setDate(endDay.getDate() - 7);

      const thisDays: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(endDay);
        d.setDate(endDay.getDate() - i);
        thisDays.push(fmt(d));
      }
      const prevDays: string[] = [];
      for (let i = 13; i >= 7; i--) {
        const d = new Date(endDay);
        d.setDate(endDay.getDate() - i);
        prevDays.push(fmt(d));
      }

      const sumMap = (map: Map<string, number>, ds: string[]) => ds.reduce((acc, k) => acc + (map.get(k) ?? 0), 0);
      const countSessions = (ds: string[]) =>
        allSessions.filter((s) => ds.includes(s.day_date || isoToDay(s.started_at)) && (s as any).exclude_from_analytics !== true).length;

      const tonThis = Math.round(sumMap(tonnageByDay, thisDays));
      const tonPrev = Math.round(sumMap(tonnageByDay, prevDays));
      const setsThis = Math.round(sumMap(setsByDay, thisDays));
      const setsPrev = Math.round(sumMap(setsByDay, prevDays));

      const sessionsThis = countSessions(thisDays);
      const sessionsPrev = countSessions(prevDays);

      const bestInRange = (map: Map<string, number>, ds: string[]) => {
        let best: number | undefined;
        for (const d of ds) {
          const v = map.get(d);
          if (v == null) continue;
          if (best == null || v > best) best = v;
        }
        return best;
      };

      const benchBest = bestInRange(bestBenchE1RM, thisDays);
      const squatBest = bestInRange(bestSquatE1RM, thisDays);
      const dlBest = bestInRange(bestDlE1RM, thisDays);

      const pct = (a: number, b: number) => {
        if (b === 0) return a === 0 ? 0 : 100;
        return ((a - b) / b) * 100;
      };

      const tonPct = pct(tonThis, tonPrev);
      const setsPct = pct(setsThis, setsPrev);

      let coachLine = "Keep the wheels turning.";
      if (sessionsThis === 0) coachLine = "No sessions logged in the last 7 days — get one on the board.";
      else if (tonThis > tonPrev && tonPct >= 10) coachLine = "Volume is up — nice. Keep intensity honest and recover hard.";
      else if (tonThis < tonPrev && tonPct <= -10) coachLine = "Volume dipped — fine if planned. If not, tighten the routine this week.";
      else if (setsThis > setsPrev && setsPct >= 10) coachLine = "More work sets this week — solid. Watch joints and sleep.";
      else if (setsThis < setsPrev && setsPct <= -10) coachLine = "Fewer sets this week — could be recovery or could be drift. Choose deliberately.";

      setWeeklyCoach({
        thisWeekStart: fmt(startThis),
        thisWeekEnd: fmt(endDay),
        sessionsThis,
        sessionsPrev,
        tonnageThis: tonThis,
        tonnagePrev: tonPrev,
        setsThis,
        setsPrev,
        benchBest,
        squatBest,
        dlBest,
        coachLine
      });


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

      
      // Quick Log trends (last 28 days) from local Dexie tables
      const dayKeys = days.map((d) => [userId, d] as [string, string]);
      const dailyRows = await localdb.dailyMetrics.bulkGet(dayKeys);
      const nutrRows = await localdb.nutritionDaily.bulkGet(dayKeys);
      const z2Rows = await localdb.zone2Daily.bulkGet(dayKeys);

      const wSeries = days
        .map((d, i) => {
          const row = dailyRows[i];
          const v = row?.weight_lbs;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const wsSeries = days
        .map((d, i) => {
          const row = dailyRows[i];
          const v = row?.waist_in;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const slSeries = days
        .map((d, i) => {
          const row = dailyRows[i];
          const v = row?.sleep_hours;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const cSeries = days
        .map((d, i) => {
          const row = nutrRows[i];
          const v = row?.calories;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const pSeries = days
        .map((d, i) => {
          const row = nutrRows[i];
          const v = row?.protein_g;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const zSeries = days
        .map((d, i) => {
          const row = z2Rows[i];
          const v = row?.minutes;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const sleepAvg7 = (() => {
        const last7 = slSeries.slice(-7).map((x) => Number(x.y)).filter((x) => Number.isFinite(x));
        if (last7.length === 0) return null;
        return last7.reduce((a, b) => a + b, 0) / last7.length;
      })();

      const proteinAvg7 = (() => {
        const last7 = pSeries.slice(-7).map((x) => Number(x.y)).filter((x) => Number.isFinite(x));
        if (last7.length === 0) return null;
        return last7.reduce((a, b) => a + b, 0) / last7.length;
      })();

      const userSessionIds = new Set(allSessions.map((s) => s.id));
      const setsByExerciseId = new Map<string, LocalWorkoutSet[]>();
      for (const st of allSets) {
        const info = exInfo.get(st.exercise_id);
        if (!info || !userSessionIds.has(info.session_id)) continue;
        const arr = setsByExerciseId.get(st.exercise_id) ?? [];
        arr.push(st);
        setsByExerciseId.set(st.exercise_id, arr);
      }

      const sessionExercisesMap = new Map<string, LocalWorkoutExercise[]>();
      for (const ex of allExercises) {
        if (!userSessionIds.has(ex.session_id)) continue;
        const arr = sessionExercisesMap.get(ex.session_id) ?? [];
        arr.push(ex);
        sessionExercisesMap.set(ex.session_id, arr);
      }

      const recentSessions = [...allSessions]
        .filter((s) => s.exclude_from_analytics !== true)
        .sort((a, b) => (a.day_date || isoToDay(a.started_at)) < (b.day_date || isoToDay(b.started_at)) ? 1 : -1);

      const recentFocusCounts: FocusCounts = { Push: 0, Pull: 0, Lower: 0, Mixed: 0 };
      const recentFocusWindow = recentSessions.slice(0, 9);
      const exerciseHistoryMap = new Map<string, ExerciseHistory>();

      for (const session of recentFocusWindow) {
        const focusCounts: FocusCounts = { Push: 0, Pull: 0, Lower: 0, Mixed: 0 };
        const exercisesForSession = sessionExercisesMap.get(session.id) ?? [];
        for (const ex of exercisesForSession) {
          const key = exerciseKey(ex.name);
          const focus = focusFromExerciseKey(key);
          focusCounts[focus] += 1;
        }
        recentFocusCounts[dominantFocusFromCounts(focusCounts)] += 1;
      }

      const today = fmt(endDay);
      for (const session of recentSessions) {
        const exercisesForSession = (sessionExercisesMap.get(session.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
        for (const ex of exercisesForSession) {
          const key = exerciseKey(ex.name);
          if (exerciseHistoryMap.has(key)) continue;
          const focus = focusFromExerciseKey(key);
          const sets = (setsByExerciseId.get(ex.id) ?? []).filter((s) => !s.is_warmup);
          let lastLoad: number | null = null;
          let lastReps: number | null = null;
          let bestE1: number | null = null;
          for (const st of sets) {
            const load = Number(st.weight_lbs ?? st.band_est_lbs ?? 0);
            const reps = Number(st.reps ?? 0);
            if (load > 0 && reps > 0) {
              if (lastLoad == null || load > lastLoad) {
                lastLoad = load;
                lastReps = reps;
              }
              const e1 = oneRmEpley(load, reps);
              if (bestE1 == null || e1 > bestE1) bestE1 = e1;
            }
          }
          exerciseHistoryMap.set(key, {
            key,
            name: displayExerciseName(ex.name),
            focus,
            lastLoad,
            lastReps,
            recentSets: sets.length,
            recentBestE1RM: bestE1,
            lastPerformedDaysAgo: daysBetweenISO(session.day_date || isoToDay(session.started_at), today)
          });
        }
      }

      const timeline: DashboardTimelineWeek[] = [];
      const currentWeekStart = startOfWeekMonday(endDay);
      for (let offset = 7; offset >= 0; offset--) {
        const start = new Date(currentWeekStart);
        start.setDate(currentWeekStart.getDate() - offset * 7);
        const endW = new Date(start);
        endW.setDate(start.getDate() + 6);
        const startIso = fmt(start);
        const endIso = fmt(endW);
        const weekSessions = recentSessions.filter((s) => {
          const d = s.day_date || isoToDay(s.started_at);
          return d >= startIso && d <= endIso;
        });

        let weekSets = 0;
        let weekTonnage = 0;
        let topLiftName = "—";
        let topLiftScore = 0;
        const weekFocusCounts: FocusCounts = { Push: 0, Pull: 0, Lower: 0, Mixed: 0 };

        for (const session of weekSessions) {
          const exercisesForSession = sessionExercisesMap.get(session.id) ?? [];
          const sessionFocusCounts: FocusCounts = { Push: 0, Pull: 0, Lower: 0, Mixed: 0 };
          for (const ex of exercisesForSession) {
            const key = exerciseKey(ex.name);
            const focus = focusFromExerciseKey(key);
            sessionFocusCounts[focus] += 1;
            const sets = (setsByExerciseId.get(ex.id) ?? []).filter((s) => !s.is_warmup);
            weekSets += sets.length;
            for (const st of sets) {
              const load = Number(st.weight_lbs ?? st.band_est_lbs ?? 0);
              const reps = Number(st.reps ?? 0);
              if (load > 0 && reps > 0) {
                weekTonnage += load * reps;
                const e1 = oneRmEpley(load, reps);
                if (e1 > topLiftScore) {
                  topLiftScore = e1;
                  topLiftName = `${displayExerciseName(ex.name)} ${Math.round(e1)}`;
                }
              }
            }
          }
          weekFocusCounts[dominantFocusFromCounts(sessionFocusCounts)] += 1;
        }

        timeline.push({
          start: startIso,
          end: endIso,
          label: `${startIso.slice(5)} → ${endIso.slice(5)}`,
          sessions: weekSessions.length,
          sets: weekSets,
          tonnage: Math.round(weekTonnage),
          topLift: topLiftName,
          dominantFocus: dominantFocusFromCounts(weekFocusCounts)
        });
      }

      const brain = computeBrainSnapshot({
        sleepAvg7,
        proteinAvg7,
        trainingDays28: days.filter((d) => (setsByDay.get(d) ?? 0) > 0).length,
        weeklyCoach: {
          sessionsThis,
          sessionsPrev,
          tonnageThis: tonThis,
          tonnagePrev: tonPrev,
          setsThis,
          setsPrev
        },
        recentFocusCounts,
        lastSessionFocus: recentFocusWindow.length > 0 ? (() => {
          const session = recentFocusWindow[0];
          const counts: FocusCounts = { Push: 0, Pull: 0, Lower: 0, Mixed: 0 };
          for (const ex of sessionExercisesMap.get(session.id) ?? []) {
            counts[focusFromExerciseKey(exerciseKey(ex.name))] += 1;
          }
          return dominantFocusFromCounts(counts);
        })() : null,
        exerciseHistory: [...exerciseHistoryMap.values()]
      });

      setTimelineWeeks(timeline);
      setBrainSnapshot(brain);
      setTonnageSeries(tonSeries);
      setSetsSeries(setSeries);
      setBenchSeries(bench);
      setSquatSeries(squat);
      setDlSeries(dl);
      setWeightSeries(wSeries);
      setWaistSeries(wsSeries);
      setSleepSeries(slSeries);
      setCalSeries(cSeries);
      setProteinSeries(pSeries);
      setZ2Series(zSeries);

      await persistDetectedMilestones({
        userId,
        benchSeries: bench,
        squatSeries: squat,
        dlSeries: dl,
        trainingDays28: days.filter((d) => (setsByDay.get(d) ?? 0) > 0).length
      });
    } finally {
      setDashBusy(false);
    }
  }


async function refreshLocalUiFromDexie() {
  if (!userId) return;

  // Don't clobber Quick Log inputs while the user is typing.
  // Those fields should reload on day changes and after explicit saves,
  // not every autosync pass.
  if (tab !== "quick") {
    await loadQuickLogForDay(selectedDayDate);
  }

  await loadSessionsForDay(selectedDayDate);
  await loadTemplates();

  if (openSessionId) {
    await openSession(openSessionId);
  }

  if (tab === "dash") {
    await refreshDashboard();
  }
}

async function syncNow() {
  await runSyncPass(setStatus, async () => {
    await refreshLocalUiFromDexie();
    setLastSyncedAt(new Date().toLocaleTimeString());
  });
}

  // -----------------------------
  // Effects
  // -----------------------------
  useEffect(() => {
    if (!userId) return;
    // Reload local state whenever the selected log date changes
    setOpenSessionId(null);
    setExercises([]);
    setSets([]);
    void loadQuickLogForDay(selectedDayDate);
    void loadSessionsForDay(selectedDayDate);
    void loadTemplates();
  }, [userId, selectedDayDate]);

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

  if (isRecoveryMode && window.location.pathname === "/reset-password") {
    return (
      <div style={{ padding: 20, maxWidth: 520 }}>
        <h2>Reset Password</h2>
        <p>Enter your new password below. This screen should be opened from the reset link emailed to you.</p>

        {!userId ? (
          <div style={{ marginBottom: 14, padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
            Waiting for recovery session from the email link. If this page was opened directly, go back and use the reset email again.
          </div>
        ) : null}

        <input
          placeholder="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />
        <input
          placeholder="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void finishPasswordReset();
            }
          }}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={finishPasswordReset} disabled={!userId}>Save New Password</button>
          <button
            type="button"
            onClick={() => {
              setIsRecoveryMode(false);
              window.history.replaceState({}, "", "/");
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

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
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void signIn();
            }
          }}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={signIn}>Sign In</button>
          <button onClick={signUp}>Sign Up</button>
          <button type="button" onClick={resetPassword}>Reset Password</button>
        </div>
      </div>
    );
  }

  const openSessionObj = sessions.find((s) => s.id === openSessionId) ?? null;

  return (
    <div style={{ padding: 20, maxWidth: 950 }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>
          {email} <span style={{ marginLeft: 6 }}>●</span>
        </div>
        <button onClick={signOut}>Logout</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Rebuild @ 60 Tracker</h2>
        
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <b>Log date:</b>
          </div>
          <input
            type="date"
            value={selectedDayDate}
            onChange={(e) => setSelectedDayDate(e.target.value)}
            style={{ padding: "6px 8px" }}
          />
          <button onClick={() => setSelectedDayDate(todayISO())}>Today</button>
          <button
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, "0");
              const dd = String(d.getDate()).padStart(2, "0");
              setSelectedDayDate(`${yyyy}-${mm}-${dd}`);
            }}
          >
            Yesterday
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div>
            <b>Status:</b> {navigator.onLine ? status : "Offline (logging still works)"}
            {lastSyncedAt ? <span style={{ marginLeft: 8, opacity: 0.8 }}>Last synced: {lastSyncedAt}</span> : null}
          </div>
          <button type="button" onClick={() => void syncNow()} disabled={!userId}>
            Sync Now
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={() => setTab("quick")} disabled={tab === "quick"}>
          Quick Log
        </button>
        <button
          onClick={() => {
            setTab("workout");
            loadSessionsForDay(selectedDayDate);
            loadTemplates();
          }}
          disabled={tab === "workout"}
        >
          Workout
        </button>
        <button onClick={() => setTab("progress")} disabled={tab === "progress"}>
          Progress
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
        <ErrorBoundary scope="Dashboard" onEmergencyExport={exportBackup}>
          <DashboardView
          dashBusy={dashBusy}
          refreshDashboard={refreshDashboard}
          exportBackup={exportBackup}
          backupBusy={backupBusy}
          importFileRef={importFileRef}
          loadBandEquiv={loadBandEquiv}
          bandEquivMap={bandEquivMap}
          setBandEquivMap={setBandEquivMap}
          bandComboFactor={bandComboFactor}
          setBandComboFactor={setBandComboFactor}
          saveBandEquiv={saveBandEquiv}
          weight={weight}
          setWeight={setWeight}
          waist={waist}
          setWaist={setWaist}
          sleepHours={sleepHours}
          setSleepHours={setSleepHours}
          calories={calories}
          setCalories={setCalories}
          protein={protein}
          setProtein={setProtein}
          z2Minutes={z2Minutes}
          setZ2Minutes={setZ2Minutes}
          notes={notes}
          setNotes={setNotes}
          saveQuickLog={saveQuickLog}
          weeklyCoach={weeklyCoach}
          tonnageSeries={tonnageSeries}
          setsSeries={setsSeries}
          benchSeries={benchSeries}
          squatSeries={squatSeries}
          dlSeries={dlSeries}
          weightSeries={weightSeries}
          waistSeries={waistSeries}
          sleepSeries={sleepSeries}
          calSeries={calSeries}
          proteinSeries={proteinSeries}
          z2Series={z2Series}
          refreshAiCoach={refreshAiCoach}
          aiCoachBusy={aiCoachBusy}
          aiCoachErr={aiCoachErr}
          aiCoach={aiCoach}
          milestones={milestones}
          timelineWeeks={timelineWeeks}
          brainSnapshot={brainSnapshot}
          timerOn={timerOn}
          setTimerOn={setTimerOn}
          secs={secs}
          setSecs={setSecs}
        />
        </ErrorBoundary>
      )}

      {tab === "quick" && (
        <ErrorBoundary scope="Quick Log" onEmergencyExport={exportBackup}>
          <QuickLogView
          weight={weight}
          setWeight={setWeight}
          waist={waist}
          setWaist={setWaist}
          sleepHours={sleepHours}
          setSleepHours={setSleepHours}
          calories={calories}
          setCalories={setCalories}
          protein={protein}
          setProtein={setProtein}
          z2Minutes={z2Minutes}
          setZ2Minutes={setZ2Minutes}
          notes={notes}
          setNotes={setNotes}
          saveQuickLog={saveQuickLog}
          exportBackup={exportBackup}
          backupBusy={backupBusy}
          importFileRef={importFileRef}
          importBackupFile={importBackupFile}
          secs={secs}
          setSecs={setSecs}
          timerOn={timerOn}
          setTimerOn={setTimerOn}
        />
        </ErrorBoundary>
      )}

      {tab === "progress" && (
        <ErrorBoundary scope="Progress" onEmergencyExport={exportBackup}>
          <ProgressView userId={userId} dayDate={selectedDayDate} setDayDate={setSelectedDayDate} />
        </ErrorBoundary>
      )}
{tab === "workout" && (
        <ErrorBoundary scope="Workout" onEmergencyExport={exportBackup}>
          <WorkoutLoggerView
            templates={templates}
            openTemplateId={openTemplateId}
            templateExercises={templateExercises}
            newTemplateName={newTemplateName}
            setNewTemplateName={setNewTemplateName}
            newTemplateDesc={newTemplateDesc}
            setNewTemplateDesc={setNewTemplateDesc}
            createTemplate={createTemplate}
            openTemplate={openTemplate}
            deleteTemplate={deleteTemplate}
            editTemplateName={editTemplateName}
            setEditTemplateName={setEditTemplateName}
            editTemplateDesc={editTemplateDesc}
            setEditTemplateDesc={setEditTemplateDesc}
            saveTemplateMeta={saveTemplateMeta}
            newTemplateExerciseName={newTemplateExerciseName}
            setNewTemplateExerciseName={setNewTemplateExerciseName}
            addExerciseToTemplate={addExerciseToTemplate}
            renameTemplateExercise={renameTemplateExercise}
            deleteTemplateExercise={deleteTemplateExercise}
            moveTemplateExercise={moveTemplateExercise}
            startSessionFromTemplate={startSessionFromTemplate}
            displayExerciseName={displayExerciseName}
            sessions={sessions}
            openSessionId={openSessionId}
            openSession={openSession}
            deleteSession={deleteSession}
            createWorkoutSession={createWorkoutSession}
            exercises={exercises}
            setsForExercise={setsForExercise}
            newExerciseName={newExerciseName}
            setNewExerciseName={setNewExerciseName}
            addExercise={addExercise}
            draftByExerciseId={draftByExerciseId}
            updateDraft={updateDraft}
            addSet={addSet}
            advanced={advanced}
            setAdvanced={setAdvanced}
            coachEnabled={coachEnabled}
            setCoachEnabled={setCoachEnabled}
            lastByExerciseName={lastByExerciseName}
            ensureLastForExerciseName={ensureLastForExerciseName}
            exerciseKey={exerciseKey}
            oneRmEpley={oneRmEpley}
            formatSet={formatSet}
            timerOn={timerOn}
            setTimerOn={setTimerOn}
            secs={secs}
            setSecs={setSecs}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}















































































































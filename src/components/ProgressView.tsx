import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { localdb, type LocalDailyMetrics, type LocalNutritionDaily, type LocalWorkoutExercise, type LocalWorkoutSession, type LocalWorkoutSet, type LocalZone2Daily } from "../localdb";
import { buildProgressSignals } from "../lib/progressSignals";
import ProgressScorecard from "./progress/ProgressScorecard";
import ProgressFlipbook from "./progress/ProgressFlipbook";
import ProgressCompare from "./progress/ProgressCompare";

type Pose = "front" | "quarter" | "side" | "back" | "other";

type ProgressPhotoRow = {
  id: string;
  user_id: string;
  taken_on: string; // YYYY-MM-DD
  pose: Pose;
  storage_path: string;
  weight_lbs: number | null;
  waist_in: number | null;
  notes: string | null;
  is_anchor: boolean | null;
  created_at: string;
  align_x?: number | null;
  align_y?: number | null;
};

type MeasurementRow = {
  id: string;
  taken_on: string;
  weight_lbs: number | null;
  waist_in: number | null;
  chest_in: number | null;
  hips_in: number | null;
  neck_in: number | null;
  upper_arm_in: number | null;
  thigh_in: number | null;
  calf_in: number | null;
  forearm_in: number | null;
  created_at: string;
};

const CORE_POSES: Pose[] = ["front", "side", "back"]
const BONUS_POSES: Pose[] = ["quarter"]
const ALL_POSES: Pose[] = ["front", "quarter", "side", "back", "other"];
const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dateToYmd(dt: Date): string {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(ymd: string, delta: number): string {
  const dt = ymdToDate(ymd);
  dt.setDate(dt.getDate() + delta);
  return dateToYmd(dt);
}

function getWeekWindowForDate(day: string, checkinDow: number): { weekStart: string; weekEnd: string } {
  // Define a week as: [Mon..Sun] by default if checkinDow=0 (Sunday).
  // More generally: weekEnd is the NEXT check-in DOW on/after 'day'; weekStart = weekEnd - 6.
  const dt = ymdToDate(day);
  const dow = dt.getDay();
  const deltaToEnd = (checkinDow - dow + 7) % 7;
  const weekEndDt = new Date(dt);
  weekEndDt.setDate(dt.getDate() + deltaToEnd);
  const weekEnd = dateToYmd(weekEndDt);
  const weekStart = addDays(weekEnd, -6);
  return { weekStart, weekEnd };
}

function inRange(ymd: string, start: string, end: string): boolean {
  return ymd >= start && ymd <= end;
}

async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  const imgUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = imgUrl;
    });

    const { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");

    ctx.drawImage(img, 0, 0, w, h);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Compression failed"))), "image/jpeg", quality);
    });

    return blob;
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

function getCheckinDow(userId: string | null): number {
  if (!userId) return 0;
  const raw = localStorage.getItem(`rebuild60_checkin_dow_${userId}`);
  const n = raw == null ? 0 : Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(6, n)) : 0;
}

function setCheckinDow(userId: string | null, dow: number) {
  if (!userId) return;
  localStorage.setItem(`rebuild60_checkin_dow_${userId}`, String(dow));
}

function bannerStyle(kind: "info" | "warn") {
  return {
    border: `1px solid ${kind === "warn" ? "rgba(255,180,0,0.35)" : "rgba(255,255,255,0.18)"}`,
    background: kind === "warn" ? "rgba(255,180,0,0.08)" : "rgba(255,255,255,0.06)",
    padding: 10,
    borderRadius: 12
  } as const;
}

function ProgressSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: 12, marginBottom: 12, background: "rgba(255,255,255,0.03)" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", border: "none", color: "inherit", padding: 0, textAlign: "left", cursor: "pointer" }}
      >
        <div>
          <div style={{ fontWeight: 800 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>{subtitle}</div> : null}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{open ? "−" : "+"}</div>
      </button>
      {open ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}

export default function ProgressView({
  userId,
  dayDate,
  setDayDate
}: {
  userId: string | null;
  dayDate: string;
  setDayDate: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<"photos" | "measures">("photos");
  const [weeklyOpen, setWeeklyOpen] = useState(true);
  const [scorecardOpen, setScorecardOpen] = useState(true);
  const [flipbookOpen, setFlipbookOpen] = useState(false);
  const [compareSectionOpen, setCompareSectionOpen] = useState(false);

  // Settings
  const [checkinDow, setCheckinDowState] = useState<number>(() => getCheckinDow(userId));

  // Photo form state
  const [pose, setPose] = useState<Pose>("front");
  const [weightLbs, setWeightLbs] = useState<string>("");
  const [waistIn, setWaistIn] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [uploadBusy, setUploadBusy] = useState(false);

  // Weekly check-in guided mode
  const [checkinMode, setCheckinMode] = useState(false);
  const [checkinStep, setCheckinStep] = useState<Pose>("front");

  // Gallery state
  const [rows, setRows] = useState<ProgressPhotoRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [comparePoseFilter, setComparePoseFilter] = useState<"all" | Pose>("all");
  const [compareAnchorsOnly, setCompareAnchorsOnly] = useState(false);

  // Measurements state
  const [mBusy, setMBusy] = useState(false);
  const [mRow, setMRow] = useState<Partial<MeasurementRow>>({});

  // Compare / Flipbook state
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState<ProgressPhotoRow | null>(null);
  const [compareB, setCompareB] = useState<ProgressPhotoRow | null>(null);
  const [compareMix, setCompareMix] = useState(50);
  const [compareView, setCompareView] = useState<"slider" | "ghost" | "map">("slider");
  const [compareOpacity, setCompareOpacity] = useState(50);
  const compareMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compareDragRef = useRef<{ active: boolean; sx: number; sy: number; ax: number; ay: number } | null>(null);

  const [flipPose, setFlipPose] = useState<Pose>("front");
  const [flipPlaying, setFlipPlaying] = useState(false);
  const [flipIdx, setFlipIdx] = useState(0);

  const [flipView, setFlipView] = useState<"normal" | "ghost" | "diff" | "map">("normal");
  const [ghostOpacity, setGhostOpacity] = useState(35); // % overlay OR heatmap intensity

  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Alignment (per-anchor) for flipbook/compare
  const [alignX, setAlignX] = useState(0);
  const [alignY, setAlignY] = useState(0);
  const [alignGrid, setAlignGrid] = useState(false);
  const [flipKeysArmed, setFlipKeysArmed] = useState(false);
  const alignSaveTimer = useRef<number | null>(null);

  // --- Derived windows ---
  const weekWindow = useMemo(() => getWeekWindowForDate(dayDate, checkinDow), [dayDate, checkinDow]);

  useEffect(() => {
    // Persist settings per user
    setCheckinDowState(getCheckinDow(userId));
  }, [userId]);

  // Difference/Change-map overlay renderer
  useEffect(() => {
    if (flipView !== "diff" && flipView !== "map") return;
    if (flipIdx <= 0) return;
    const cur = flipList[flipIdx];
    const prev = flipList[flipIdx - 1];
    const canvas = diffCanvasRef.current;
    if (!cur || !prev || !canvas) return;
    const curUrl = thumbs[cur.id];
    const prevUrl = thumbs[prev.id];
    let cancelled = false;
    (async () => {
      try {
        await drawOverlayCanvas(
          flipView === "map" ? "map" : "diff",
          canvas,
          prevUrl,
          curUrl,
          { x: (prev.align_x ?? 0) as number, y: (prev.align_y ?? 0) as number },
          { x: (cur.align_x ?? 0) as number, y: (cur.align_y ?? 0) as number },
          ghostOpacity
        );
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [flipView, flipIdx, ghostOpacity, thumbs, alignX, alignY]);

  useEffect(() => {
    (async () => {
      if (!userId) return;
      // Autofill from Quick Log (local Dexie)
      const daily = await localdb.dailyMetrics.get([userId, dayDate]);
      if (daily) {
        if ((daily.weight_lbs ?? null) != null) setWeightLbs(String(daily.weight_lbs));
        if ((daily.waist_in ?? null) != null) setWaistIn(String(daily.waist_in));
        if ((daily.notes ?? "").trim() && !notes.trim()) setNotes(daily.notes ?? "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dayDate]);

  async function ensureThumb(id: string, storage_path: string) {
    if (thumbs[id]) return;
    const { data: s, error: se } = await supabase.storage.from("progress-photos").createSignedUrl(storage_path, 60 * 60);
    if (se) throw se;
    if (s?.signedUrl) setThumbs((p) => ({ ...p, [id]: s.signedUrl }));
  }

  async function refreshGallery() {
    if (!userId) return;
    setGalleryBusy(true);
    try {
      const { data, error } = await supabase
        .from("progress_photos")
        .select("*")
        .eq("user_id", userId)
        .order("taken_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(400);

      if (error) throw error;
      const list = (data ?? []) as any as ProgressPhotoRow[];
      setRows(list);

      // sign a handful for snappy UX
      const next: Record<string, string> = {};
      for (const r of list.slice(0, 80)) {
        const { data: s, error: se } = await supabase.storage.from("progress-photos").createSignedUrl(r.storage_path, 60 * 60);
        if (!se && s?.signedUrl) next[r.id] = s.signedUrl;
      }
      setThumbs(next);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setGalleryBusy(false);
    }
  }

  async function loadMeasurementsForDay() {
    if (!userId) return;
    setMBusy(true);
    try {
      const { data, error } = await supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", userId)
        .eq("taken_on", dayDate)
        .limit(1)
        .maybeSingle();

      if (error && (error as any).code !== "PGRST116") throw error; // no rows
      if (data) setMRow(data as any);
      else {
        const daily = await localdb.dailyMetrics.get([userId, dayDate]);
        setMRow({
          taken_on: dayDate,
          weight_lbs: daily?.weight_lbs ?? null,
          waist_in: daily?.waist_in ?? null
        });
      }
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setMBusy(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    refreshGallery();
    loadMeasurementsForDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadMeasurementsForDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayDate, userId]);

  const weekPoseRows = useMemo(() => {
    const byPose: Record<Pose, ProgressPhotoRow[]> = { front: [], quarter: [], side: [], back: [], other: [] };
    for (const r of rows) {
      if (!inRange(r.taken_on, weekWindow.weekStart, weekWindow.weekEnd)) continue;
      byPose[r.pose]?.push(r);
    }
    return byPose;
  }, [rows, weekWindow.weekStart, weekWindow.weekEnd]);

  const weekLatestByPose = useMemo(() => {
    const out: Partial<Record<Pose, ProgressPhotoRow>> = {};
    for (const p of CORE_POSES) {
      const list = weekPoseRows[p] ?? [];
      out[p] = list.length ? list[0] : undefined; // rows already ordered desc
    }
    return out;
  }, [weekPoseRows]);

  const weekMissing = useMemo(() => {
    const missing: Pose[] = [];
    for (const p of CORE_POSES) {
      if (!weekLatestByPose[p]) missing.push(p);
    }
    return missing;
  }, [weekLatestByPose]);

  const weekComplete = weekMissing.length === 0;

  // Anchors for flipbook/highlights
  const anchorsByPose = useMemo(() => {
    const by: Record<Pose, ProgressPhotoRow[]> = { front: [], quarter: [], side: [], back: [], other: [] };
    for (const r of rows) {
      if (r.is_anchor) by[r.pose]?.push(r);
    }
    // anchorsByPose[*] currently in DESC order; flipbook wants ASC
    return by;
  }, [rows]);

  const flipList = useMemo(() => {
    const list = (anchorsByPose[flipPose] ?? []).slice().reverse();
    return list;
  }, [anchorsByPose, flipPose]);

  const latestAnchorPairByPose = useMemo(() => {
    const out: Partial<Record<Pose, { previous: ProgressPhotoRow; latest: ProgressPhotoRow }>> = {};
    for (const p of CORE_POSES) {
      const list = anchorsByPose[p] ?? []; // DESC
      if (list.length >= 2) {
        out[p] = { previous: list[1], latest: list[0] };
      }
    }
    return out;
  }, [anchorsByPose]);

  const compareRowsFiltered = useMemo(() => {
    return rows.filter((r) => {
      if (comparePoseFilter !== "all" && r.pose !== comparePoseFilter) return false;
      if (compareAnchorsOnly && !r.is_anchor) return false;
      return true;
    });
  }, [rows, comparePoseFilter, compareAnchorsOnly]);

  useEffect(() => {
    if (!flipPlaying) return;
    if (!flipList.length) return;

    const t = window.setInterval(() => {
      setFlipIdx((i) => (i + 1) % flipList.length);
    }, 900);

    return () => window.clearInterval(t);
  }, [flipPlaying, flipList.length]);

  useEffect(() => {
    // If user switches pose, reset index safely
    setFlipIdx(0);
    setFlipPlaying(false);
  }, [flipPose]);

  
  // Sync alignment state to the current flipbook frame
  useEffect(() => {
    const cur = flipList[flipIdx];
    if (!cur) return;
    setAlignX((cur.align_x ?? 0) as number);
    setAlignY((cur.align_y ?? 0) as number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipIdx, flipPose, flipList.length]);
useEffect(() => {
    // Ensure current (and previous, for ghost) flipbook frames are loaded
    const cur = flipList[flipIdx];
    if (!cur) return;
    ensureThumb(cur.id, cur.storage_path).catch(() => {});

    if (flipView !== "normal" && flipList.length > 1) {
      const prevIdx = Math.max(0, flipIdx - 1);
      const prev = flipList[prevIdx];
      if (prev) ensureThumb(prev.id, prev.storage_path).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipIdx, flipPose, flipView, flipList.length]);

  
  useEffect(() => {
    if (!flipKeysArmed) return;
    const cur = flipList[flipIdx];
    if (!cur) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't steal keys when typing
      const t = e.target as any;
      const tag = (t?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const step = e.shiftKey ? 10 : 2;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeAlign(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeAlign(0, step);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeAlign(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeAlign(step, 0);
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        resetAlign();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipKeysArmed, flipIdx, flipPose, flipList.length, alignX, alignY]);
function monthKey(ymd: string) {
    return ymd.slice(0, 7); // YYYY-MM
  }

  const monthlyHighlights = useMemo(() => {
    const key = monthKey(dayDate);
    const highlights: Record<Pose, { first?: ProgressPhotoRow; last?: ProgressPhotoRow }> = {
      front: {},
      side: {},
      back: {},
      other: {}
    };

    for (const p of CORE_POSES) {
      const listAsc = (anchorsByPose[p] ?? []).slice().reverse();
      const inMonth = listAsc.filter((r) => monthKey(r.taken_on) === key);
      if (!inMonth.length) continue;
      highlights[p].first = inMonth[0];
      highlights[p].last = inMonth[inMonth.length - 1];
    }

    return { key, highlights };
  }, [anchorsByPose, dayDate]);

  
  

// Monthly report (Quick Log + Measurements + Anchors)
const [monthReportBusy, setMonthReportBusy] = useState(false);
const [monthDaily, setMonthDaily] = useState<LocalDailyMetrics[]>([]);
const [monthNutrition, setMonthNutrition] = useState<LocalNutritionDaily[]>([]);
const [monthZone2, setMonthZone2] = useState<LocalZone2Daily[]>([]);
const [monthMeas, setMonthMeas] = useState<MeasurementRow[]>([]);
const [monthSessions, setMonthSessions] = useState<LocalWorkoutSession[]>([]);
const [monthExercises, setMonthExercises] = useState<LocalWorkoutExercise[]>([]);
const [monthSets, setMonthSets] = useState<LocalWorkoutSet[]>([]);
const [aiBusy, setAiBusy] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [aiInsightHistory, setAiInsightHistory] = useState<
    { id: string; ts: string; monthKey?: string; text: string }[]
  >([]);
  const [aiAppendMode, setAiAppendMode] = useState<boolean>(false);
  const [aiShowHistory, setAiShowHistory] = useState<boolean>(false);

  // Physique scorecard (monthly)
  type Scorecard = {
    monthKey: string;
    ts: string;
    conditioning: number;
    muscularity: number;
    symmetry: number;
    waist_control: number;
    consistency: number;
    momentum: "up" | "down" | "flat";
    notes?: string;
    signals_used?: any | null;
  };

  const [scoreBusy, setScoreBusy] = useState(false);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [scoreHistory, setScoreHistory] = useState<Scorecard[]>([]);
  const [lastScoreSignals, setLastScoreSignals] = useState<any | null>(null);
  const [scoreShowHistory, setScoreShowHistory] = useState(false);
  const [showSignalDebug, setShowSignalDebug] = useState(false);

  const scorecardMetrics: Array<{ key: "conditioning" | "muscularity" | "symmetry" | "waist_control" | "consistency"; label: string }> = [
    { key: "conditioning", label: "Conditioning" },
    { key: "muscularity", label: "Muscularity" },
    { key: "symmetry", label: "Symmetry" },
    { key: "waist_control", label: "Waist Control" },
    { key: "consistency", label: "Consistency" },
  ];

  // Vision AI (photo-to-photo) analysis
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionPose, setVisionPose] = useState<Pose>("front");
  const [visionScope, setVisionScope] = useState<"last2" | "month">("month");
  const [visionFocus, setVisionFocus] = useState<"balanced" | "lower" | "upper">("balanced");
  const [visionText, setVisionText] = useState<string>("");
  const [visionAppendMode, setVisionAppendMode] = useState<boolean>(false);
  const [visionShowHistory, setVisionShowHistory] = useState<boolean>(false);
  const [visionHistory, setVisionHistory] = useState<
    { id: string; ts: string; monthKey?: string; pose: Pose; scope: string; text: string }[]
  >([]);

  const stableScoreHistory = useMemo(() => dedupeScorecards(normalizeMonthScopedHistory(scoreHistory)), [scoreHistory]);
  const stableAiInsightHistory = useMemo(() => dedupeAiArtifacts(normalizeMonthScopedHistory(aiInsightHistory)), [aiInsightHistory]);
  const stableVisionHistory = useMemo(() => dedupeVisionArtifacts(normalizeMonthScopedHistory(visionHistory)), [visionHistory]);

function monthStartEnd(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // last day
  const toYMD = (d: Date) => d.toISOString().slice(0, 10);
  return { startYMD: toYMD(start), endYMD: toYMD(end) };
}


function safeMonthKeyFromIso(isoLike?: string | null): string | undefined {
  const raw = String(isoLike ?? "").trim();
  if (!raw) return undefined;
  const m = raw.match(/^(\d{4}-\d{2})/);
  return m ? m[1] : undefined;
}

function normalizeMonthScopedHistory<T extends { monthKey?: string; ts?: string; text?: string; pose?: string; scope?: string }>(rows: T[]): T[] {
  return rows.map((row) => {
    const monthKey = row.monthKey ?? safeMonthKeyFromIso(row.ts);
    return monthKey ? { ...row, monthKey } : row;
  });
}

function matchesVisionArtifact(row: { monthKey?: string; pose?: string; scope?: string }, activeMonth: string, pose: Pose, scope: "last2" | "month") {
  return row.monthKey === activeMonth && row.pose === pose && row.scope === scope;
}

type ProgressArtifactEnvelope = {
  id: string;
  artifactType: "scorecard" | "ai" | "vision";
  monthKey: string;
  ts: string;
  pose?: string;
  scope?: string;
  payload: any;
};

function makeArtifactEnvelopeKey(row: ProgressArtifactEnvelope) {
  if (row.artifactType === "vision") return [row.artifactType, row.monthKey, row.pose ?? "", row.scope ?? "", row.ts].join("|");
  return [row.artifactType, row.monthKey, row.ts].join("|");
}

function dedupeArtifactEnvelopes(rows: ProgressArtifactEnvelope[]) {
  const seen = new Set<string>();
  const out: ProgressArtifactEnvelope[] = [];
  for (const row of [...rows].sort((a, b) => b.ts.localeCompare(a.ts))) {
    const key = makeArtifactEnvelopeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function scorecardArtifactKey(row: { monthKey?: string; ts?: string; conditioning?: number; muscularity?: number; symmetry?: number; waist_control?: number; consistency?: number; momentum?: string; notes?: string }) {
  return [
    row.monthKey ?? "",
    row.ts ?? "",
    row.conditioning ?? "",
    row.muscularity ?? "",
    row.symmetry ?? "",
    row.waist_control ?? "",
    row.consistency ?? "",
    row.momentum ?? "",
    row.notes ?? "",
  ].join("|");
}

function aiArtifactKey(row: { monthKey?: string; ts?: string; text?: string }) {
  return [row.monthKey ?? "", row.ts ?? "", (row.text ?? "").trim()].join("|");
}

function visionArtifactKey(row: { monthKey?: string; ts?: string; pose?: string; scope?: string; text?: string }) {
  return [row.monthKey ?? "", row.pose ?? "", row.scope ?? "", row.ts ?? "", (row.text ?? "").trim()].join("|");
}

function dedupeScorecards(rows: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const row of [...rows].sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")))) {
    const key = scorecardArtifactKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function dedupeAiArtifacts(rows: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const row of [...rows].sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")))) {
    const key = aiArtifactKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function dedupeVisionArtifacts(rows: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const row of [...rows].sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")))) {
    const key = visionArtifactKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function decodeArtifactStore(envelopes: ProgressArtifactEnvelope[]) {
  const scorecards = dedupeScorecards(
    envelopes
      .filter((row) => row.artifactType === "scorecard")
      .map((row) => ({ ...row.payload, monthKey: row.monthKey ?? row.payload?.monthKey, ts: row.ts ?? row.payload?.ts }))
  );
  const aiRuns = dedupeAiArtifacts(
    envelopes
      .filter((row) => row.artifactType === "ai")
      .map((row) => ({ ...row.payload, monthKey: row.monthKey ?? row.payload?.monthKey, ts: row.ts ?? row.payload?.ts }))
  );
  const visionRuns = dedupeVisionArtifacts(
    envelopes
      .filter((row) => row.artifactType === "vision")
      .map((row) => ({
        ...row.payload,
        monthKey: row.monthKey ?? row.payload?.monthKey,
        ts: row.ts ?? row.payload?.ts,
        pose: row.pose ?? row.payload?.pose,
        scope: row.scope ?? row.payload?.scope,
      }))
  );
  return { scorecards, aiRuns, visionRuns };
}

function encodeArtifactStore(args: { scorecards: any[]; aiRuns: any[]; visionRuns: any[] }) {
  const envelopes: ProgressArtifactEnvelope[] = [
    ...args.scorecards.map((row) => ({
      id: `scorecard:${scorecardArtifactKey(row)}`,
      artifactType: "scorecard" as const,
      monthKey: row.monthKey ?? safeMonthKeyFromIso(row.ts) ?? "unknown-month",
      ts: row.ts ?? new Date().toISOString(),
      payload: row,
    })),
    ...args.aiRuns.map((row) => ({
      id: `ai:${aiArtifactKey(row)}`,
      artifactType: "ai" as const,
      monthKey: row.monthKey ?? safeMonthKeyFromIso(row.ts) ?? "unknown-month",
      ts: row.ts ?? new Date().toISOString(),
      payload: row,
    })),
    ...args.visionRuns.map((row) => ({
      id: `vision:${visionArtifactKey(row)}`,
      artifactType: "vision" as const,
      monthKey: row.monthKey ?? safeMonthKeyFromIso(row.ts) ?? "unknown-month",
      ts: row.ts ?? new Date().toISOString(),
      pose: row.pose,
      scope: row.scope,
      payload: row,
    })),
  ];
  return dedupeArtifactEnvelopes(envelopes).slice(0, 72);
}

useEffect(() => {
  (async () => {
    if (!userId) return;
    setMonthReportBusy(true);
    try {
      const { startYMD, endYMD } = monthStartEnd(dayDate);

      // Quick Log + training data from local Dexie
      const [daily, nutrition, zone2, sessions] = await Promise.all([
        localdb.dailyMetrics
          .where("[user_id+day_date]")
          .between([userId, startYMD], [userId, endYMD], true, true)
          .sortBy("day_date"),
        localdb.nutritionDaily
          .where("[user_id+day_date]")
          .between([userId, startYMD], [userId, endYMD], true, true)
          .sortBy("day_date"),
        localdb.zone2Daily
          .where("[user_id+day_date]")
          .between([userId, startYMD], [userId, endYMD], true, true)
          .sortBy("day_date"),
        localdb.localSessions
          .where("user_id")
          .equals(userId)
          .filter((row) => row.day_date >= startYMD && row.day_date <= endYMD)
          .sortBy("day_date"),
      ]);
      setMonthDaily(daily ?? []);
      setMonthNutrition(nutrition ?? []);
      setMonthZone2(zone2 ?? []);
      setMonthSessions(sessions ?? []);

      const sessionIds = new Set((sessions ?? []).map((row) => row.id));
      if (sessionIds.size > 0) {
        const exercises = (await localdb.localExercises.toArray()).filter((row) => sessionIds.has(row.session_id));
        setMonthExercises(exercises);
        const exerciseIds = new Set(exercises.map((row) => row.id));
        const sets = exerciseIds.size > 0
          ? (await localdb.localSets.toArray()).filter((row) => exerciseIds.has(row.exercise_id))
          : [];
        setMonthSets(sets);
      } else {
        setMonthExercises([]);
        setMonthSets([]);
      }

      // Measurements from Supabase
      const { data: mdata, error: merr } = await supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", userId)
        .gte("taken_on", startYMD)
        .lte("taken_on", endYMD)
        .order("taken_on", { ascending: true });

      if (merr && (merr as any).code !== "PGRST116") throw merr;
      setMonthMeas((mdata as any) ?? []);
    } catch (e: any) {
      // Keep the rest of the page usable even if report fetch fails
      console.error(e);
    } finally {
      setMonthReportBusy(false);
    }
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [userId, dayDate]);

// Load persisted progress artifacts (month-scoped + backward compatible)
useEffect(() => {
  if (!userId) return;
  try {
    const unifiedKey = `rebuild60_progress_artifacts_${userId}`;
    const rawUnified = localStorage.getItem(unifiedKey);
    if (rawUnified) {
      const parsed = JSON.parse(rawUnified);
      if (Array.isArray(parsed)) {
        const decoded = decodeArtifactStore(parsed as ProgressArtifactEnvelope[]);
        setScoreHistory(decoded.scorecards);
        setAiInsightHistory(decoded.aiRuns);
        setVisionHistory(decoded.visionRuns);
        return;
      }
    }

    const rawScores = localStorage.getItem(`rebuild60_scorecards_${userId}`);
    const rawAi = localStorage.getItem(`rebuild60_progress_ai_${userId}`);
    const rawVision = localStorage.getItem(`rebuild60_vision_${userId}`);

    const legacyScores = rawScores ? JSON.parse(rawScores) : [];
    const legacyAi = rawAi ? JSON.parse(rawAi) : [];
    const legacyVision = rawVision ? JSON.parse(rawVision) : [];

    if (Array.isArray(legacyScores)) setScoreHistory(dedupeScorecards(normalizeMonthScopedHistory(legacyScores)));
    if (Array.isArray(legacyAi)) setAiInsightHistory(dedupeAiArtifacts(normalizeMonthScopedHistory(legacyAi)));
    if (Array.isArray(legacyVision)) setVisionHistory(dedupeVisionArtifacts(normalizeMonthScopedHistory(legacyVision)));
  } catch {
    // ignore
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [userId]);

useEffect(() => {
  if (!userId) return;
  try {
    const scorecards = stableScoreHistory.slice(0, 24);
    const aiRuns = stableAiInsightHistory.slice(0, 24);
    const visionRuns = stableVisionHistory.slice(0, 24);
    localStorage.setItem(`rebuild60_progress_artifacts_${userId}`, JSON.stringify(encodeArtifactStore({ scorecards, aiRuns, visionRuns })));
    localStorage.setItem(`rebuild60_scorecards_${userId}`, JSON.stringify(scorecards));
    localStorage.setItem(`rebuild60_progress_ai_${userId}`, JSON.stringify(aiRuns));
    localStorage.setItem(`rebuild60_vision_${userId}`, JSON.stringify(visionRuns));
  } catch {
    // ignore
  }
}, [userId, stableScoreHistory, stableAiInsightHistory, stableVisionHistory]);
useEffect(() => {
  const activeMonth = monthKey(dayDate);
  const latestScore = stableScoreHistory
    .filter((row) => row.monthKey === activeMonth)
    .sort((a, b) => b.ts.localeCompare(a.ts))[0] ?? null;
  setScorecard(latestScore);
  setLastScoreSignals(latestScore?.signals_used ?? null);

  const latestAi = stableAiInsightHistory
    .filter((row) => row.monthKey === activeMonth)
    .sort((a, b) => b.ts.localeCompare(a.ts))[0] ?? null;
  setAiInsight(latestAi?.text ?? "");

  const latestVision = stableVisionHistory
    .filter((row) => matchesVisionArtifact(row, activeMonth, visionPose, visionScope))
    .sort((a, b) => b.ts.localeCompare(a.ts))[0]
    ?? stableVisionHistory
      .filter((row) => row.monthKey === activeMonth)
      .sort((a, b) => b.ts.localeCompare(a.ts))[0]
    ?? null;
  setVisionText(latestVision?.text ?? "");
}, [dayDate, stableScoreHistory, stableAiInsightHistory, stableVisionHistory, visionPose, visionScope]);


const monthStats = useMemo(() => {
  const { startYMD, endYMD } = monthStartEnd(dayDate);

  const firstLast = (arr: any[], key: string) => {
    const vals = arr
      .map((r) => r?.[key])
      .filter((v) => v != null && v !== "" && !Number.isNaN(Number(v)))
      .map((v) => Number(v));
    if (!vals.length) return { first: null, last: null, delta: null };
    return { first: vals[0], last: vals[vals.length - 1], delta: vals[vals.length - 1] - vals[0] };
  };

  const avg = (arr: any[], key: string) => {
    const vals = arr
      .map((r) => r?.[key])
      .filter((v) => v != null && v !== "" && !Number.isNaN(Number(v)))
      .map((v) => Number(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const signals = buildProgressSignals({
    monthKey: monthKey(dayDate),
    startYMD,
    endYMD,
    monthDaily,
    monthNutrition,
    monthZone2,
    monthMeasurements: monthMeas,
    monthPhotos: rows.filter((r) => r.taken_on >= startYMD && r.taken_on <= endYMD),
    monthSessions,
    monthExercises,
    monthSets,
    visionText,
  });

  return {
    monthKey: monthKey(dayDate),
    startYMD,
    endYMD,
    quicklogDays: monthDaily.length,
    measDays: monthMeas.length,
    qWeight: firstLast(monthDaily, "weight_lbs"),
    qWaist: firstLast(monthDaily, "waist_in"),
    mWeight: firstLast(monthMeas, "weight_lbs"),
    mWaist: firstLast(monthMeas, "waist_in"),
    avgSleep: avg(monthDaily, "sleep_hours"),
    avgCalories: avg(monthNutrition, "calories"),
    avgProtein: avg(monthNutrition, "protein_g"),
    avgZone2: avg(monthZone2, "minutes"),
    workoutsCompleted: signals.workoutsCompleted,
    hardSets: signals.hardSets,
    anchorDays: signals.anchorDays,
    adherenceScore: signals.adherenceScore,
    progressionHits: signals.progressionHits,
    pushPullBalance: signals.pushPullBalance,
    signals,
  };
}, [dayDate, monthDaily, monthNutrition, monthZone2, monthMeas, monthSessions, monthExercises, monthSets, rows, visionText]);

const visibleScoreHistory = useMemo(() => {
  const activeMonth = monthKey(dayDate);
  return stableScoreHistory
    .filter((row) => row.monthKey === activeMonth)
    .sort((a, b) => b.ts.localeCompare(a.ts));
}, [dayDate, stableScoreHistory]);

const visibleAiHistory = useMemo(() => {
  const activeMonth = monthKey(dayDate);
  return stableAiInsightHistory
    .filter((row) => row.monthKey === activeMonth)
    .sort((a, b) => b.ts.localeCompare(a.ts));
}, [dayDate, stableAiInsightHistory]);

const visibleVisionHistory = useMemo(() => {
  const activeMonth = monthKey(dayDate);
  return stableVisionHistory
    .filter((row) => matchesVisionArtifact(row, activeMonth, visionPose, visionScope))
    .sort((a, b) => b.ts.localeCompare(a.ts));
}, [dayDate, stableVisionHistory, visionPose, visionScope]);

const previousScorecard = useMemo<Scorecard | null>(() => {
  if (!scorecard || stableScoreHistory.length === 0) return null;
  const byNewest = [...stableScoreHistory].sort((a, b) => b.ts.localeCompare(a.ts));
  const idx = byNewest.findIndex((s) => s.ts === scorecard.ts);
  if (idx >= 0) return byNewest[idx + 1] ?? null;

  const older = byNewest.find((s) => s.ts < scorecard.ts);
  return older ?? byNewest[0] ?? null;
}, [scorecard, stableScoreHistory]);

const scorecardDeltaSummary = useMemo(() => {
  if (!scorecard || !previousScorecard) return null;

  const deltas = scorecardMetrics.map((metric) => {
    const currentVal = Number(scorecard[metric.key] ?? 0);
    const previousVal = Number(previousScorecard[metric.key] ?? 0);
    const delta = Number((currentVal - previousVal).toFixed(1));
    return { ...metric, delta };
  });

  const improving = deltas.filter((d) => d.delta > 0).length;
  const flat = deltas.filter((d) => d.delta === 0).length;
  const down = deltas.filter((d) => d.delta < 0).length;

  return { deltas, improving, flat, down };
}, [scorecard, previousScorecard, scorecardMetrics]);

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta.toFixed(1)}`;
  if (delta < 0) return `${delta.toFixed(1)}`;
  return `0.0`;
}

function deltaTone(delta: number): React.CSSProperties {
  if (delta > 0) {
    return {
      color: "#0f766e",
      background: "rgba(16, 185, 129, 0.12)",
      border: "1px solid rgba(16, 185, 129, 0.28)",
    };
  }
  if (delta < 0) {
    return {
      color: "#b45309",
      background: "rgba(245, 158, 11, 0.12)",
      border: "1px solid rgba(245, 158, 11, 0.28)",
    };
  }
  return {
    color: "rgba(255,255,255,0.9)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
  };
}

function getDeterministicSignals() {
  if (monthStats?.signals) return monthStats.signals;
  const { startYMD, endYMD } = monthStartEnd(dayDate);
  return buildProgressSignals({
    monthKey: monthKey(dayDate),
    startYMD,
    endYMD,
    monthDaily,
    monthNutrition,
    monthZone2,
    monthMeasurements: monthMeas,
    monthPhotos: rows.filter((r) => r.taken_on >= startYMD && r.taken_on <= endYMD),
    monthSessions,
    monthExercises,
    monthSets,
    visionText,
  });
}

async function buildInsightPayload() {
  const key = monthKey(dayDate);
  const { startYMD, endYMD } = monthStartEnd(dayDate);
  const basisSignals = lastScoreSignals ?? getDeterministicSignals();

  const images: { label: string; url: string }[] = [];
  const addImg = async (label: string, row?: ProgressPhotoRow) => {
    if (!row?.storage_path) return;
    try {
      const { data: s, error: se } = await supabase.storage.from("progress-photos").createSignedUrl(row.storage_path, 60 * 10);
      if (!se && s?.signedUrl) images.push({ label, url: s.signedUrl });
    } catch {
      // ignore
    }
  };

  // Use monthly highlights (first/last anchor in month) per pose
  for (const p of CORE_POSES) {
    const h = (monthlyHighlights.highlights as any)[p] as { first?: ProgressPhotoRow; last?: ProgressPhotoRow };
    if (h?.first) await addImg(`${p.toUpperCase()} FIRST (${h.first.taken_on})`, h.first);
    if (h?.last && h.last.id !== h.first?.id) await addImg(`${p.toUpperCase()} LAST (${h.last.taken_on})`, h.last);
  }

  return {
    month: key,
    startYMD,
    endYMD,
    stats: {
      ...monthStats,
      scorecard: scorecard
        ? {
            conditioning: scorecard.conditioning,
            muscularity: scorecard.muscularity,
            symmetry: scorecard.symmetry,
            waist_control: scorecard.waist_control,
            consistency: scorecard.consistency,
            momentum: scorecard.momentum,
            notes: scorecard.notes ?? null,
          }
        : null,
      previous_scorecard: previousScorecard
        ? {
            conditioning: previousScorecard.conditioning,
            muscularity: previousScorecard.muscularity,
            symmetry: previousScorecard.symmetry,
            waist_control: previousScorecard.waist_control,
            consistency: previousScorecard.consistency,
            momentum: previousScorecard.momentum,
            notes: previousScorecard.notes ?? null,
          }
        : null,
      scorecard_delta_summary: scorecardDeltaSummary ?? null,
      signals: basisSignals ?? null,
      scorecard_basis_signals: basisSignals ?? null,
      vision_context: visionText?.trim()
        ? {
            pose: visionPose,
            scope: visionScope,
            focus: visionFocus,
            text: visionText.trim(),
          }
        : null,
    },
    images,
  };
}

async function generateAiPhysiqueInsight() {
  if (aiBusy) return;
  setAiBusy(true);
  if (!aiAppendMode) setAiInsight("");
  try {
    const payload = await buildInsightPayload();
    const resp = await fetch("/.netlify/functions/progress-ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.message ?? "AI insight failed");
    const nextText = (data?.text ?? "").trim();
    const ts = new Date().toISOString();
    const id = `${ts}-${Math.random().toString(16).slice(2)}`;

    // Always keep a small history of runs.
    if (nextText) {
      setAiInsightHistory((prev) => [{ id, ts, monthKey: monthStats.monthKey, text: nextText }, ...prev].slice(0, 12));
    }

    // Prevent accidental duplicates (double-click, rerender, etc.)
    setAiInsight((prev) => {
      const prevTrim = (prev || "").trim();
      if (!nextText) return prev;
      if (prevTrim === nextText) return prev;
      if (aiAppendMode) return prev ? `${prev}\n\n---\n\n${nextText}` : nextText;
      return nextText;
    });
  } catch (e: any) {
    alert(e?.message ?? String(e));
  } finally {
    setAiBusy(false);
  }
}

async function generatePhysiqueScorecard() {
  if (scoreBusy) return;
  setScoreBusy(true);
  try {
    const basisSignals = getDeterministicSignals();
    if (!basisSignals) throw new Error("Could not build deterministic progress signals for this month.");
    setLastScoreSignals(basisSignals);

    const payload = await buildInsightPayload();
    payload.stats = {
      ...(payload.stats ?? {}),
      signals: basisSignals,
      scorecard_basis_signals: basisSignals,
    };

    const resp = await fetch("/.netlify/functions/progress-scorecard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.message ?? "Scorecard failed");

    const sc = data?.scorecard as any;
    if (!sc) throw new Error("No scorecard returned");
    const persistedSignals = data?.signals_used ?? basisSignals ?? monthStats.signals ?? null;
    setLastScoreSignals(persistedSignals);

    const next: Scorecard = {
      monthKey: monthStats.monthKey,
      ts: new Date().toISOString(),
      conditioning: Number(sc.conditioning ?? 0),
      muscularity: Number(sc.muscularity ?? 0),
      symmetry: Number(sc.symmetry ?? 0),
      waist_control: Number(sc.waist_control ?? 0),
      consistency: Number(sc.consistency ?? 0),
      momentum: (sc.momentum === "up" || sc.momentum === "down" || sc.momentum === "flat") ? sc.momentum : "flat",
      notes: String(sc.notes ?? "").trim() || undefined,
      signals_used: persistedSignals,
    };

    setScorecard(next);
    setScoreHistory((prev) => {
      // de-dupe same month+scores
      const sig = `${next.monthKey}|${next.conditioning}|${next.muscularity}|${next.symmetry}|${next.waist_control}|${next.consistency}|${next.momentum}|${next.notes ?? ""}`;
      const filtered = prev.filter((p) => {
        const psig = `${p.monthKey}|${p.conditioning}|${p.muscularity}|${p.symmetry}|${p.waist_control}|${p.consistency}|${p.momentum}|${p.notes ?? ""}`;
        return psig !== sig;
      });
      return [next, ...filtered].slice(0, 24);
    });
  } catch (e: any) {
    alert(e?.message ?? String(e));
  } finally {
    setScoreBusy(false);
  }
}

async function runVisionPhysiqueAnalysis() {
  if (visionBusy) return;
  if (!userId) return;

  // Pick a pair of anchor photos for the selected pose
  const pose = visionPose;
  const anchorsDesc = (anchorsByPose[pose] ?? []); // DESC order

  let a: ProgressPhotoRow | undefined;
  let b: ProgressPhotoRow | undefined;
  let labelA = "BEFORE";
  let labelB = "AFTER";

  if (visionScope === "month") {
    const hl = monthlyHighlights?.highlights?.[pose];
    if (hl?.first && hl?.last && hl.first.id !== hl.last.id) {
      a = hl.first;
      b = hl.last;
      labelA = `MONTH START (${hl.first.taken_on})`;
      labelB = `MONTH END (${hl.last.taken_on})`;
    } else {
      // fallback to last2 if not enough anchors this month
      if (anchorsDesc.length >= 2) {
        b = anchorsDesc[0];
        a = anchorsDesc[1];
        labelA = `PREV (${a.taken_on})`;
        labelB = `LATEST (${b.taken_on})`;
      }
    }
  } else {
    if (anchorsDesc.length >= 2) {
      b = anchorsDesc[0];
      a = anchorsDesc[1];
      labelA = `PREV (${a.taken_on})`;
      labelB = `LATEST (${b.taken_on})`;
    }
  }

  if (!a || !b) {
    alert("Need at least two anchor photos for that pose (or two anchors in the current month).");
    return;
  }

  setVisionBusy(true);
  try {
    // Ensure we have signed URLs
    // (Don't rely on React state here; fetch signed URLs directly to avoid race conditions.)
    const { data: sa, error: sea } = await supabase.storage.from("progress-photos").createSignedUrl(a.storage_path, 60 * 60);
    if (sea) throw sea;
    const { data: sb, error: seb } = await supabase.storage.from("progress-photos").createSignedUrl(b.storage_path, 60 * 60);
    if (seb) throw seb;
    const imageA = sa?.signedUrl;
    const imageB = sb?.signedUrl;
    if (!imageA || !imageB) throw new Error("Could not load signed photo URLs.");

    // still populate thumbs cache for the UI
    try {
      setThumbs((p) => ({ ...p, [a!.id]: imageA!, [b!.id]: imageB! }));
    } catch {
      // ignore
    }

    const resp = await fetch("/.netlify/functions/physique-vision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pose,
        labelA,
        labelB,
        imageA,
        imageB,
        focus: visionFocus,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.message ?? "Vision analysis failed");

    const nextText = String(data?.text ?? "").trim();
    if (!nextText) throw new Error("No text returned from Vision analysis");

    const ts = new Date().toISOString();
    const id = `${ts}-${Math.random().toString(16).slice(2)}`;

    // Keep a small local history
    setVisionHistory((prev) => [{ id, ts, monthKey: monthStats.monthKey, pose, scope: visionScope, text: nextText }, ...prev].slice(0, 24));

    setVisionText((prev) => {
      const prevTrim = (prev || "").trim();
      if (prevTrim === nextText) return prev;
      if (visionAppendMode) return prev ? `${prev}\n\n---\n\n${nextText}` : nextText;
      return nextText;
    });
  } catch (e: any) {
    alert(e?.message ?? String(e));
  } finally {
    setVisionBusy(false);
  }
}
function updateLocalAlign(photoId: string, x: number, y: number) {
    setRows((prev) =>
      prev.map((r) => (r.id === photoId ? { ...r, align_x: x, align_y: y } : r))
    );
  }

  async function persistAlign(photoId: string, x: number, y: number) {
    await supabase.from("progress_photos").update({ align_x: x, align_y: y }).eq("id", photoId);
  }

  function schedulePersistAlign(photoId: string, x: number, y: number) {
    if (alignSaveTimer.current) window.clearTimeout(alignSaveTimer.current);
    alignSaveTimer.current = window.setTimeout(() => {
      persistAlign(photoId, x, y).catch(() => {});
    }, 180);
  }

  function nudgeAlign(dx: number, dy: number) {
    const cur = flipList[flipIdx];
    if (!cur) return;
    const nx = (alignX ?? 0) + dx;
    const ny = (alignY ?? 0) + dy;
    setAlignX(nx);
    setAlignY(ny);
    updateLocalAlign(cur.id, nx, ny);
    schedulePersistAlign(cur.id, nx, ny);
  }

  function resetAlign() {
    const cur = flipList[flipIdx];
    if (!cur) return;
    setAlignX(0);
    setAlignY(0);
    updateLocalAlign(cur.id, 0, 0);
    schedulePersistAlign(cur.id, 0, 0);
  }

  function copyPrevAlignToCurrent() {
    if (flipIdx <= 0) return;
    const cur = flipList[flipIdx];
    const prev = flipList[flipIdx - 1];
    if (!cur || !prev) return;
    const nx = (prev.align_x ?? 0) as number;
    const ny = (prev.align_y ?? 0) as number;
    setAlignX(nx);
    setAlignY(ny);
    updateLocalAlign(cur.id, nx, ny);
    schedulePersistAlign(cur.id, nx, ny);
  }

  async function copyAlignBetweenPhotos(fromId: string, toId: string) {
    const from = rows.find((r) => r.id === fromId);
    const to = rows.find((r) => r.id === toId);
    if (!from || !to) return;
    const nx = (from.align_x ?? 0) as number;
    const ny = (from.align_y ?? 0) as number;
    // update local cache immediately
    updateLocalAlign(toId, nx, ny);
    await persistAlign(toId, nx, ny);

    // If compare modal is open and we're copying into the active "after" photo, keep it in sync.
    if (compareOpen && compareB && compareB.id === toId) {
      setCompareB({ ...compareB, align_x: nx, align_y: ny });
    }
  }
async function handleUpload() {
    if (!userId) {
      alert("Not signed in.");
      return;
    }
    const f = fileRef.current?.files?.[0];
    if (!f) {
      alert("Pick a photo first.");
      return;
    }

    setUploadBusy(true);
    try {
      // Compress & upload
      const blob = await compressImage(f);
      const stamp = Date.now();
      const path = `${userId}/${dayDate}/${pose}_${stamp}.jpg`;

      const { error: upErr } = await supabase.storage.from("progress-photos").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: false
      });
      if (upErr) throw upErr;

      const wl = weightLbs.trim() ? Number(weightLbs) : null;
      const wi = waistIn.trim() ? Number(waistIn) : null;

      let inherit_align_x: number | null = null;
      let inherit_align_y: number | null = null;

      // Anchor rule: For Front/Side/Back, mark the FIRST photo in the current week as is_anchor.
let is_anchor: boolean | null = null;

// Auto-alignment inheritance defaults (only used for core poses)
// NOTE: values are stored per-photo (align_x/align_y) and inherited from the most recent prior anchor of same pose.
if (CORE_POSES.includes(pose)) {
  const { weekStart, weekEnd } = getWeekWindowForDate(dayDate, checkinDow);

  const already = rows.some(
    (r) => r.pose === pose && inRange(r.taken_on, weekStart, weekEnd) && (r.is_anchor ?? false)
  );
  is_anchor = already ? false : true;

  if (is_anchor === true) {
    try {
      const priorAnchors = rows
        .filter((r) => r.pose === pose && (r.is_anchor ?? false) && r.taken_on < takenOnIso)
        .sort((a, b) => (a.taken_on > b.taken_on ? -1 : 1));

      const last = priorAnchors[0];
      if (last) {
        inherit_align_x = (last.align_x ?? 0) as number;
        inherit_align_y = (last.align_y ?? 0) as number;
      }
    } catch {
      // ignore: alignment inheritance is a convenience only
    }
  }
}
const { error: insErr } = await supabase.from("progress_photos").insert({
        user_id: userId,
        taken_on: dayDate,
        pose,
        storage_path: path,
        weight_lbs: Number.isFinite(wl as any) ? wl : null,
        waist_in: Number.isFinite(wi as any) ? wi : null,
        notes: notes.trim() ? notes.trim() : null,
        is_anchor,
        align_x: inherit_align_x,
        align_y: inherit_align_y,
      });

      if (insErr) throw insErr;

      // cleanup
      if (fileRef.current) fileRef.current.value = "";
      await refreshGallery();

      // Guided check-in stepper
      if (checkinMode) {
        const nextMissing = CORE_POSES.find((p) => {
          if (p === pose) return false;
          return !rows.some((r) => r.pose === p && inRange(r.taken_on, weekWindow.weekStart, weekWindow.weekEnd));
        });
        if (nextMissing) {
          setCheckinStep(nextMissing);
          setPose(nextMissing);
          window.setTimeout(() => fileRef.current?.focus(), 50);
        } else {
          setCheckinMode(false);
          alert("Weekly check-in complete. Front/Side/Back are all in the bag.");
        }
      }
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleDelete(r: ProgressPhotoRow) {
    if (!userId) return;
    const ok = confirm(
      "Delete photo?\n\nThis permanently removes:\n• the image\n• progress metadata\n• any AI analysis tied to it"
    );
    if (!ok) return;

    try {
      const { error: delErr } = await supabase.storage.from("progress-photos").remove([r.storage_path]);
      if (delErr) throw delErr;

      const { error: rowErr } = await supabase.from("progress_photos").delete().eq("id", r.id);
      if (rowErr) throw rowErr;

      // optional AI reviews table (future)
      try {
        await supabase.from("photo_ai_reviews").delete().eq("photo_id", r.id);
      } catch {
        // ignore
      }

      await refreshGallery();
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  }

  async function saveMeasurements() {
    if (!userId) return;
    setMBusy(true);
    try {
      const payload: any = {
        user_id: userId,
        taken_on: dayDate,
        weight_lbs: mRow.weight_lbs ?? null,
        waist_in: mRow.waist_in ?? null,
        chest_in: mRow.chest_in ?? null,
        hips_in: mRow.hips_in ?? null,
        neck_in: mRow.neck_in ?? null,
        upper_arm_in: mRow.upper_arm_in ?? null,
        thigh_in: mRow.thigh_in ?? null,
        calf_in: mRow.calf_in ?? null,
        forearm_in: mRow.forearm_in ?? null
      };

      const { error } = await supabase.from("body_measurements").upsert(payload, { onConflict: "user_id,taken_on" });
      if (error) throw error;
      alert("Measurements saved.");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setMBusy(false);
    }
  }

  async function openCompareForRow(r: ProgressPhotoRow) {
    // Compare this photo (B) against previous anchor for same pose (A)
    const prev = (anchorsByPose[r.pose] ?? []).find((x) => x.taken_on < r.taken_on);
    if (!prev) {
      alert("No previous anchor found for this pose yet. Upload at least 2 weekly anchors.");
      return;
    }
    try {
      await ensureThumb(prev.id, prev.storage_path);
      await ensureThumb(r.id, r.storage_path);
      setCompareA(prev);
      setCompareB(r);
      setCompareMix(50);
      setCompareOpen(true);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  }

  async function openComparePair(a: ProgressPhotoRow, b: ProgressPhotoRow) {
    try {
      await ensureThumb(a.id, a.storage_path);
      await ensureThumb(b.id, b.storage_path);
      setCompareA(a);
      setCompareB(b);
      setCompareMix(50);
      setCompareOpen(true);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  }

  function compareNudge(dx: number, dy: number) {
    if (!compareB) return;
    const nx = ((compareB.align_x ?? 0) as number) + dx;
    const ny = ((compareB.align_y ?? 0) as number) + dy;
    setCompareB({ ...compareB, align_x: nx, align_y: ny });
    updateLocalAlign(compareB.id, nx, ny);
    schedulePersistAlign(compareB.id, nx, ny);
  }

  function compareReset() {
    if (!compareB) return;
    setCompareB({ ...compareB, align_x: 0, align_y: 0 });
    updateLocalAlign(compareB.id, 0, 0);
    schedulePersistAlign(compareB.id, 0, 0);
  }

  if (!userId) {
  

  async function drawOverlayCanvas(
    mode: "diff" | "map",
    canvas: HTMLCanvasElement | null,
    prevUrl: string | undefined,
    curUrl: string | undefined,
    prevAlign: { x: number; y: number },
    curAlign: { x: number; y: number },
    intensityPct = 35
  ) {
    if (!canvas || !prevUrl || !curUrl) return;
    const loadImg = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    const [imgA, imgB] = await Promise.all([loadImg(prevUrl), loadImg(curUrl)]);
    const w = 320;
    const h = Math.round((w * imgB.naturalHeight) / Math.max(1, imgB.naturalWidth));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const offA = document.createElement("canvas");
    const offB = document.createElement("canvas");
    offA.width = w; offA.height = h; offB.width = w; offB.height = h;
    const ctxA = offA.getContext("2d");
    const ctxB = offB.getContext("2d");
    if (!ctxA || !ctxB) return;

    const drawContain = (c: CanvasRenderingContext2D, img: HTMLImageElement, ox: number, oy: number) => {
      c.clearRect(0, 0, w, h);
      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      c.drawImage(img, dx + ox, dy + oy, dw, dh);
    };

    drawContain(ctxA, imgA, prevAlign.x, prevAlign.y);
    drawContain(ctxB, imgB, curAlign.x, curAlign.y);

    if (mode === "diff") {
      const a = ctxA.getImageData(0, 0, w, h);
      const b = ctxB.getImageData(0, 0, w, h);
      const out = ctx.createImageData(w, h);
      const threshold = 18 + Math.round((intensityPct / 100) * 24);
      for (let i = 0; i < a.data.length; i += 4) {
        const dr = Math.abs(a.data[i] - b.data[i]);
        const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
        const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
        const d = (dr + dg + db) / 3;
        const alpha = d > threshold ? Math.min(255, (d - threshold) * 6) : 0;
        out.data[i] = Math.min(255, alpha);
        out.data[i + 1] = Math.min(255, Math.round(alpha * 0.65));
        out.data[i + 2] = 0;
        out.data[i + 3] = alpha;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.putImageData(out, 0, 0);
      return;
    }

    const makeOutline = (source: CanvasRenderingContext2D, color: [number, number, number], alphaMul = 1) => {
      const src = source.getImageData(0, 0, w, h);
      const out = ctx.createImageData(w, h);
      const px = src.data;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;
          const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
          const right = (px[i + 4] + px[i + 5] + px[i + 6]) / 3;
          const down = (px[i + w * 4] + px[i + w * 4 + 1] + px[i + w * 4 + 2]) / 3;
          const edge = Math.max(Math.abs(lum - right), Math.abs(lum - down));
          if (edge > 40) {
            out.data[i] = color[0];
            out.data[i + 1] = color[1];
            out.data[i + 2] = color[2];
            out.data[i + 3] = Math.round(200 * alphaMul);
          }
        }
      }
      return out;
    };

    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(makeOutline(ctxA, [255, 70, 70], 0.9), 0, 0);
    ctx.putImageData(makeOutline(ctxB, [80, 255, 120], 0.95), 0, 0);
  }

  useEffect(() => {
    if (!compareOpen || compareView !== "map" || !compareA || !compareB) return;
    const canvas = compareMapCanvasRef.current;
    const prevUrl = thumbs[compareA.id];
    const curUrl = thumbs[compareB.id];
    (async () => {
      try {
        await drawOverlayCanvas(
          "map",
          canvas,
          prevUrl,
          curUrl,
          { x: (compareA.align_x ?? 0) as number, y: (compareA.align_y ?? 0) as number },
          { x: (compareB.align_x ?? 0) as number, y: (compareB.align_y ?? 0) as number },
          compareOpacity
        );
      } catch {}
    })();
  }, [compareOpen, compareView, compareA, compareB, thumbs, compareOpacity]);

  return (
      <div>
        <h3>Progress</h3>
        <p>Please sign in to use Progress Photos and Measurements.</p>
      </div>
    );
  }

  const today = dateToYmd(new Date());
  const isThisWeek = inRange(today, weekWindow.weekStart, weekWindow.weekEnd);
  const promptKey = `rebuild60_week_prompt_${userId}_${weekWindow.weekEnd}`;
  const promptDismissed = localStorage.getItem(promptKey) === "1";

  return (
    <div>
      <h2>Progress</h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setMode("photos")} disabled={mode === "photos"}>
          Photos
        </button>
        <button onClick={() => setMode("measures")} disabled={mode === "measures"}>
          Measurements
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Date:{" "}
          <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} style={{ padding: 6 }} />
        </label>

        <label>
          Weekly check-in day:{" "}
          <select
            value={checkinDow}
            onChange={(e) => {
              const v = Number(e.target.value);
              setCheckinDow(userId, v);
              setCheckinDowState(v);
            }}
            style={{ padding: 6 }}
          >
            {DOW_LABELS.map((lab, i) => (
              <option key={lab} value={i}>
                {lab}
              </option>
            ))}
          </select>
        </label>

        <span style={{ opacity: 0.75 }}>
          Week window: <strong>{weekWindow.weekStart}</strong> → <strong>{weekWindow.weekEnd}</strong>
        </span>
      </div>

      <hr />

      {mode === "photos" && (
        <div>
          <ProgressSection
            title="Weekly Check-In"
            subtitle="Weekly ritual for anchor photos, weight, waist, and notes."
            open={weeklyOpen}
            onToggle={() => setWeeklyOpen((v) => !v)}
          >
          <div style={{ ...bannerStyle(weekComplete ? "info" : "warn"), marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <strong>Weekly Check-In</strong> (Front / Side / Back)
                <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                  {CORE_POSES.map((p) => (
                    <div key={p}>
                      {p.toUpperCase()}: {weekLatestByPose[p] ? "✅" : "⏳"}
                      {weekLatestByPose[p] ? (
                        <span style={{ opacity: 0.75 }}> — {weekLatestByPose[p]!.taken_on}</span>
                      ) : null}
                    </div>
                  ))}
                </div>

                {!weekComplete ? (
                  <div style={{ marginTop: 8, opacity: 0.9 }}>
                    Upload all 3 poses to unlock the rest of Progress: <strong>Compare</strong>, <strong>Flipbook</strong>, and <strong>Monthly highlights</strong>.
                  </div>
                ) : (
                  <div style={{ marginTop: 8, opacity: 0.9 }}>
                    ✅ Week complete. Check-in is ready to feed the rest of Progress.
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {!checkinMode ? (
                  <button
                    onClick={() => {
                      const next = weekMissing[0] ?? "front";
                      setCheckinMode(true);
                      setCheckinStep(next);
                      setPose(next);
                      window.setTimeout(() => fileRef.current?.focus(), 50);
                    }}
                  >
                    Start Weekly Check-In
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setCheckinMode(false);
                      alert("Check-in cancelled (nothing deleted). You can resume anytime.");
                    }}
                  >
                    Cancel Check-In
                  </button>
                )}

                <button
                  onClick={() => {
                    // Jump date to the end of this week (the check-in day)
                    setDayDate(weekWindow.weekEnd);
                  }}
                >
                  Jump to Check-In Day
                </button>
              </div>
            </div>

            {/* Gentle weekly prompt */}
            {isThisWeek && !weekComplete && !promptDismissed ? (
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ opacity: 0.95 }}>
                  Missing this week: <strong>{weekMissing.map((p) => p.toUpperCase()).join(" / ")}</strong>.
                  {" "}One clean check-in per week, and you’ve got a movie by summer.
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem(promptKey, "1");
                    // force re-render
                    setCheckinDowState((x) => x);
                  }}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>

          {checkinMode ? (
            <div style={{ ...bannerStyle("info"), marginBottom: 12 }}>
              <strong>Check-In Mode:</strong> Upload <strong>{checkinStep.toUpperCase()}</strong> next.
              <span style={{ opacity: 0.8 }}> (After upload, it will auto-advance.)</span>
            </div>
          ) : null}

          <h3>Upload Photo</h3>

          <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
            <label>
              Pose:{" "}
              <select value={pose} onChange={(e) => setPose(e.target.value as Pose)} style={{ padding: 6 }}>
                <option value="front">Front</option>
                <option value="quarter">Quarter Turn</option>
                <option value="side">Side</option>
                <option value="back">Back</option>
                <option value="other">Other</option>
              </select>
              <span style={{ marginLeft: 10, opacity: 0.75 }}>
                {CORE_POSES.includes(pose)
                  ? "Counts toward Weekly Check-In (and becomes an Anchor for that week if it's the first)"
                  : BONUS_POSES.includes(pose)
                    ? "Bonus pose: boosts Vision confidence and lower-body read quality"
                    : "Not part of weekly anchor set"}
              </span>
            </label>

            <label>
              Photo: <input ref={fileRef} type="file" accept="image/*" />
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label>
                Weight (lbs):{" "}
                <input value={weightLbs} onChange={(e) => setWeightLbs(e.target.value)} style={{ width: 120 }} />
              </label>
              <label>
                Waist (in):{" "}
                <input value={waistIn} onChange={(e) => setWaistIn(e.target.value)} style={{ width: 120 }} />
              </label>
              <button
                onClick={async () => {
                  const daily = await localdb.dailyMetrics.get([userId, dayDate]);
                  if (daily?.weight_lbs != null) setWeightLbs(String(daily.weight_lbs));
                  if (daily?.waist_in != null) setWaistIn(String(daily.waist_in));
                  if ((daily?.notes ?? "").trim()) setNotes(daily?.notes ?? "");
                  alert("Auto-filled from Quick Log (local). ");
                }}
              >
                Auto-fill from Quick Log
              </button>
            </div>

            <label>
              Notes:
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{ width: "100%", padding: 8 }}
              />
            </label>

            <button onClick={handleUpload} disabled={uploadBusy}>
              {uploadBusy ? "Uploading..." : "Upload"}
            </button>
          </div>

          <hr />
          </ProgressSection>

          <ProgressScorecard
            scorecardOpen={scorecardOpen}
            onToggle={() => setScorecardOpen((v) => !v)}
            monthStats={monthStats}
            monthReportBusy={monthReportBusy}
            monthlyHighlights={monthlyHighlights}
            generatePhysiqueScorecard={generatePhysiqueScorecard}
            scoreBusy={scoreBusy}
            generateAiPhysiqueInsight={generateAiPhysiqueInsight}
            aiBusy={aiBusy}
            runVisionPhysiqueAnalysis={runVisionPhysiqueAnalysis}
            visionBusy={visionBusy}
            scoreShowHistory={scoreShowHistory}
            setScoreShowHistory={setScoreShowHistory}
            scoreHistory={visibleScoreHistory}
            aiShowHistory={aiShowHistory}
            setAiShowHistory={setAiShowHistory}
            aiInsightHistory={visibleAiHistory}
            visionShowHistory={visionShowHistory}
            setVisionShowHistory={setVisionShowHistory}
            visionHistory={visibleVisionHistory}
            scorecard={scorecard}
            setScorecard={setScorecard}
            aiInsight={aiInsight}
            setAiInsight={setAiInsight}
            visionText={visionText}
            setVisionText={setVisionText}
            aiAppendMode={aiAppendMode}
            setAiAppendMode={setAiAppendMode}
            visionAppendMode={visionAppendMode}
            setVisionAppendMode={setVisionAppendMode}
            visionPose={visionPose}
            setVisionPose={setVisionPose}
            visionScope={visionScope}
            setVisionScope={setVisionScope}
            visionFocus={visionFocus}
            setVisionFocus={setVisionFocus}
            scorecardDeltaSummary={scorecardDeltaSummary}
            previousScorecard={previousScorecard}
            scorecardMetrics={scorecardMetrics}
            formatDelta={formatDelta}
            deltaTone={deltaTone}
            lastScoreSignals={lastScoreSignals ?? monthStats.signals ?? null}
            showSignalDebug={showSignalDebug}
            setShowSignalDebug={setShowSignalDebug}
          />

          <ProgressFlipbook
            ProgressSection={ProgressSection}
            bannerStyle={bannerStyle}
            flipbookOpen={flipbookOpen}
            onToggle={() => setFlipbookOpen((v) => !v)}
            flipPose={flipPose}
            setFlipPose={setFlipPose}
            flipList={flipList}
            flipIdx={flipIdx}
            setFlipIdx={setFlipIdx}
            flipPlaying={flipPlaying}
            setFlipPlaying={setFlipPlaying}
            flipView={flipView}
            setFlipView={setFlipView}
            ghostOpacity={ghostOpacity}
            setGhostOpacity={setGhostOpacity}
            monthlyHighlights={monthlyHighlights}
            CORE_POSES={CORE_POSES}
            thumbs={thumbs}
            alignGrid={alignGrid}
            alignX={alignX}
            alignY={alignY}
            diffCanvasRef={diffCanvasRef}
            nudgeAlign={nudgeAlign}
            resetAlign={resetAlign}
            setAlignGrid={setAlignGrid}
            flipKeysArmed={flipKeysArmed}
            setFlipKeysArmed={setFlipKeysArmed}
            copyPrevAlignToCurrent={copyPrevAlignToCurrent}
          />

          <ProgressCompare
            ProgressSection={ProgressSection}
            bannerStyle={bannerStyle}
            compareSectionOpen={compareSectionOpen}
            onToggle={() => setCompareSectionOpen((v) => !v)}
            refreshGallery={refreshGallery}
            galleryBusy={galleryBusy}
            rows={rows}
            CORE_POSES={CORE_POSES}
            latestAnchorPairByPose={latestAnchorPairByPose}
            openComparePair={openComparePair}
            comparePoseFilter={comparePoseFilter}
            setComparePoseFilter={setComparePoseFilter}
            compareAnchorsOnly={compareAnchorsOnly}
            setCompareAnchorsOnly={setCompareAnchorsOnly}
            compareRowsFiltered={compareRowsFiltered}
            openCompareForRow={openCompareForRow}
            handleDelete={handleDelete}
            thumbs={thumbs}
            ensureThumb={ensureThumb}
            compareOpen={compareOpen}
            compareA={compareA}
            compareB={compareB}
            setCompareOpen={setCompareOpen}
            compareView={compareView}
            setCompareView={setCompareView}
            copyAlignBetweenPhotos={copyAlignBetweenPhotos}
            compareMix={compareMix}
            setCompareMix={setCompareMix}
            compareOpacity={compareOpacity}
            setCompareOpacity={setCompareOpacity}
            compareDragRef={compareDragRef}
            setCompareB={setCompareB}
            updateLocalAlign={updateLocalAlign}
            schedulePersistAlign={schedulePersistAlign}
            compareMapCanvasRef={compareMapCanvasRef}
            compareNudge={compareNudge}
            compareReset={compareReset}
          />
        </div>
      )}

      {mode === "measures" && (
        <div>
          <h3>Measurements</h3>
          <p style={{ opacity: 0.8 }}>One set per day. Auto-fills weight/waist from Quick Log when available.</p>

          <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
            <label>
              Weight (lbs):{" "}
              <input
                value={mRow.weight_lbs ?? ""}
                onChange={(e) => setMRow((p) => ({ ...p, weight_lbs: e.target.value ? Number(e.target.value) : null }))}
                style={{ width: 120 }}
              />
            </label>
            <label>
              Waist (in):{" "}
              <input
                value={mRow.waist_in ?? ""}
                onChange={(e) => setMRow((p) => ({ ...p, waist_in: e.target.value ? Number(e.target.value) : null }))}
                style={{ width: 120 }}
              />
            </label>

            <details>
              <summary>More measurements</summary>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {[
                  ["chest_in", "Chest (in)"],
                  ["hips_in", "Hips (in)"],
                  ["neck_in", "Neck (in)"],
                  ["upper_arm_in", "Upper arm (in)"],
                  ["thigh_in", "Thigh (in)"],
                  ["calf_in", "Calf (in)"],
                  ["forearm_in", "Forearm (in)"]
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}: {" "}
                    <input
                      value={(mRow as any)[key] ?? ""}
                      onChange={(e) =>
                        setMRow((p) => ({ ...p, [key]: e.target.value ? Number(e.target.value) : null } as any))
                      }
                      style={{ width: 120 }}
                    />
                  </label>
                ))}
              </div>
            </details>

            <button onClick={saveMeasurements} disabled={mBusy}>
              {mBusy ? "Saving..." : "Save measurements"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}























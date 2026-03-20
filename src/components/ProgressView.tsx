import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { localdb } from "../localdb";

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
const [monthDaily, setMonthDaily] = useState<any[]>([]);
const [monthMeas, setMonthMeas] = useState<MeasurementRow[]>([]);
const [aiBusy, setAiBusy] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [aiInsightHistory, setAiInsightHistory] = useState<
    { id: string; ts: string; text: string }[]
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
  };

  const [scoreBusy, setScoreBusy] = useState(false);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [scoreHistory, setScoreHistory] = useState<Scorecard[]>([]);
  const [scoreShowHistory, setScoreShowHistory] = useState(false);

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
    { id: string; ts: string; pose: Pose; scope: string; text: string }[]
  >([]);

function monthStartEnd(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // last day
  const toYMD = (d: Date) => d.toISOString().slice(0, 10);
  return { startYMD: toYMD(start), endYMD: toYMD(end) };
}

useEffect(() => {
  (async () => {
    if (!userId) return;
    setMonthReportBusy(true);
    try {
      const { startYMD, endYMD } = monthStartEnd(dayDate);

      // Quick Log from local Dexie (dailyMetrics)
      const daily = await localdb.dailyMetrics
        .where("[user_id+day_date]")
        .between([userId, startYMD], [userId, endYMD], true, true)
        .sortBy("day_date");
      setMonthDaily(daily ?? []);

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

// Load/save scorecard history (local only)
useEffect(() => {
  if (!userId) return;
  try {
    const key = `rebuild60_scorecards_${userId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setScoreHistory(parsed);
    }
  } catch {
    // ignore
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [userId]);

useEffect(() => {
  if (!userId) return;
  try {
    const key = `rebuild60_scorecards_${userId}`;
    localStorage.setItem(key, JSON.stringify(scoreHistory.slice(0, 24)));
  } catch {
    // ignore
  }
}, [userId, scoreHistory]);

// Load/save Vision history (local only)
useEffect(() => {
  if (!userId) return;
  try {
    const key = `rebuild60_vision_${userId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setVisionHistory(parsed);
    }
  } catch {
    // ignore
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [userId]);

useEffect(() => {
  if (!userId) return;
  try {
    const key = `rebuild60_vision_${userId}`;
    localStorage.setItem(key, JSON.stringify(visionHistory.slice(0, 24)));
  } catch {
    // ignore
  }
}, [userId, visionHistory]);

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

  const qWeight = firstLast(monthDaily, "weight_lbs");
  const qWaist = firstLast(monthDaily, "waist_in");
  const mWeight = firstLast(monthMeas, "weight_lbs");
  const mWaist = firstLast(monthMeas, "waist_in");

  const avg = (key: string) => {
    const vals = monthDaily
      .map((r) => r?.[key])
      .filter((v) => v != null && v !== "" && !Number.isNaN(Number(v)))
      .map((v) => Number(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  return {
    monthKey: monthKey(dayDate),
    startYMD,
    endYMD,
    quicklogDays: monthDaily.length,
    measDays: monthMeas.length,
    qWeight,
    qWaist,
    mWeight,
    mWaist,
    avgSleep: avg("sleep_hours"),
    avgCalories: avg("calories"),
    avgProtein: avg("protein_g"),
    avgZone2: avg("zone2_minutes"),
  };
}, [dayDate, monthDaily, monthMeas]);

const previousScorecard = useMemo<Scorecard | null>(() => {
  if (!scorecard || scoreHistory.length === 0) return null;
  const byNewest = [...scoreHistory].sort((a, b) => b.ts.localeCompare(a.ts));
  const idx = byNewest.findIndex((s) => s.ts === scorecard.ts);
  if (idx >= 0) return byNewest[idx + 1] ?? null;

  const older = byNewest.find((s) => s.ts < scorecard.ts);
  return older ?? byNewest[0] ?? null;
}, [scorecard, scoreHistory]);

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

async function buildInsightPayload() {
  const key = monthKey(dayDate);
  const { startYMD, endYMD } = monthStartEnd(dayDate);

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
      setAiInsightHistory((prev) => [{ id, ts, text: nextText }, ...prev].slice(0, 12));
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
    const payload = await buildInsightPayload();
    const resp = await fetch("/.netlify/functions/progress-scorecard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.message ?? "Scorecard failed");

    const sc = data?.scorecard as any;
    if (!sc) throw new Error("No scorecard returned");

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
    setVisionHistory((prev) => [{ id, ts, pose, scope: visionScope, text: nextText }, ...prev].slice(0, 24));

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

          <ProgressSection
            title="Monthly Scorecard"
            subtitle="Structured monthly evaluation built from Quick Log, measurements, anchors, and coach interpretation."
            open={scorecardOpen}
            onToggle={() => setScorecardOpen((v) => !v)}
          >

          {/* AI Physique Insight (Monthly report + AI) */}
          <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                <div>
                  <strong>Monthly Scorecard + Coach Analysis</strong> <span style={{ opacity: 0.8 }}>({monthStats.monthKey})</span>
                  <div style={{ marginTop: 6, opacity: 0.85, fontSize: 12 }}>
                    Window: {monthStats.startYMD} → {monthStats.endYMD}
                    {monthReportBusy ? " • loading…" : ""}
                  </div>
                </div>

                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify({ monthStats, monthlyHighlights }, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `rebuild60-monthly-report-${monthStats.monthKey}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export JSON
                </button>
              </div>

              <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <div>
                    <strong>Advanced Analysis Tools</strong>
                    <div style={{ marginTop: 4, opacity: 0.8, fontSize: 12 }}>
                      Manual analysis actions. Keep these when you want a fresh structured score, a new coach read, or a vision pass.
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={generatePhysiqueScorecard} disabled={scoreBusy} title="Generate a 1–10 monthly scorecard">
                      {scoreBusy ? "Scoring…" : "Run Scorecard"}
                    </button>
                    <button onClick={generateAiPhysiqueInsight} disabled={aiBusy}>
                      {aiBusy ? "Generating AI…" : "Run AI"}
                    </button>
                    <button onClick={runVisionPhysiqueAnalysis} disabled={visionBusy} title="Compare two photos with Vision AI">
                      {visionBusy ? "Vision…" : "Run Vision"}
                    </button>
                    <button onClick={() => setScoreShowHistory((s) => !s)} disabled={scoreHistory.length === 0} title="Show previous scorecards">
                      {scoreShowHistory ? "Hide scores" : "Scores"}
                    </button>
                    <button onClick={() => setAiShowHistory((s) => !s)} disabled={aiInsightHistory.length === 0} title="Show previous AI runs">
                      {aiShowHistory ? "Hide AI history" : "AI history"}
                    </button>
                    <button onClick={() => setVisionShowHistory((s) => !s)} disabled={visionHistory.length === 0} title="Show previous Vision runs">
                      {visionShowHistory ? "Hide vision" : "Vision history"}
                    </button>
                    <button onClick={() => setScorecard(null)} disabled={!scorecard} title="Clear the current scorecard display">
                      Clear score
                    </button>
                    <button onClick={() => setAiInsight("")} disabled={!aiInsight} title="Clear the current AI output">
                      Clear AI
                    </button>
                    <button onClick={() => setVisionText("")} disabled={!visionText} title="Clear the current Vision output">
                      Clear vision
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.9 }}>
                    <input type="checkbox" checked={aiAppendMode} onChange={(e) => setAiAppendMode(e.target.checked)} />
                    Append AI runs
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.9 }}>
                    <input type="checkbox" checked={visionAppendMode} onChange={(e) => setVisionAppendMode(e.target.checked)} />
                    Append Vision runs
                  </label>
                  <label style={{ fontSize: 12, opacity: 0.9 }}>
                    Vision pose:{" "}
                    <select value={visionPose} onChange={(e) => setVisionPose(e.target.value as Pose)} style={{ padding: 6 }}>
                      <option value="front">Front</option>
                      <option value="quarter">Quarter Turn</option>
                      <option value="side">Side</option>
                      <option value="back">Back</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, opacity: 0.9 }}>
                    Scope:{" "}
                    <select value={visionScope} onChange={(e) => setVisionScope(e.target.value as any)} style={{ padding: 6 }}>
                      <option value="month">This month (first → last)</option>
                      <option value="last2">Last 2 anchors</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, opacity: 0.9 }}>
                    Focus:{" "}
                    <select value={visionFocus} onChange={(e) => setVisionFocus(e.target.value as any)} style={{ padding: 6 }}>
                      <option value="balanced">Balanced</option>
                      <option value="lower">Lower Body Priority</option>
                      <option value="upper">Upper Body Priority</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.06)" }}>
                  <strong>Quick Log</strong>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>Days logged: {monthStats.quicklogDays}</div>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>
                    Weight:{" "}
                    {monthStats.qWeight.first == null
                      ? "—"
                      : `${monthStats.qWeight.first.toFixed(1)} → ${monthStats.qWeight.last?.toFixed(1)} (${monthStats.qWeight.delta! >= 0 ? "+" : ""}${monthStats.qWeight.delta!.toFixed(1)})`}
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>
                    Waist:{" "}
                    {monthStats.qWaist.first == null
                      ? "—"
                      : `${monthStats.qWaist.first.toFixed(1)} → ${monthStats.qWaist.last?.toFixed(1)} (${monthStats.qWaist.delta! >= 0 ? "+" : ""}${monthStats.qWaist.delta!.toFixed(1)})`}
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>
                    Avg sleep: {monthStats.avgSleep == null ? "—" : monthStats.avgSleep.toFixed(1)}h • Avg protein:{" "}
                    {monthStats.avgProtein == null ? "—" : Math.round(monthStats.avgProtein)}g • Avg Zone2:{" "}
                    {monthStats.avgZone2 == null ? "—" : Math.round(monthStats.avgZone2)}m
                  </div>
                </div>

                <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.06)" }}>
                  <strong>Measurements</strong>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>Entries: {monthStats.measDays}</div>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>
                    Weight:{" "}
                    {monthStats.mWeight.first == null
                      ? "—"
                      : `${monthStats.mWeight.first.toFixed(1)} → ${monthStats.mWeight.last?.toFixed(1)} (${monthStats.mWeight.delta! >= 0 ? "+" : ""}${monthStats.mWeight.delta!.toFixed(1)})`}
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>
                    Waist:{" "}
                    {monthStats.mWaist.first == null
                      ? "—"
                      : `${monthStats.mWaist.first.toFixed(1)} → ${monthStats.mWaist.last?.toFixed(1)} (${monthStats.mWaist.delta! >= 0 ? "+" : ""}${monthStats.mWaist.delta!.toFixed(1)})`}
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>
                    Tip: Quick Log is your “daily signal.” Measurements are your “official tape.”
                  </div>
                </div>

                <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.06)" }}>
                  <strong>Physique Scorecard</strong>
                  <div style={{ marginTop: 6, opacity: 0.85, fontSize: 12 }}>
                    1–10 ratings for this month. Use it to see trajectory, not perfection.
                  </div>

                  {scorecard ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ opacity: 0.9 }}>Month: <strong>{scorecard.monthKey}</strong></div>
                        <div style={{ opacity: 0.75, fontSize: 12 }}>Generated: {scorecard.ts.replace("T", " ").slice(0, 19)}Z</div>
                      </div>

                      {scorecardDeltaSummary ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <strong>Scorecard Trend</strong>
                          <span style={{ fontSize: 12, opacity: 0.9 }}>vs {previousScorecard?.monthKey}</span>
                          <span style={{ fontSize: 12, opacity: 0.9 }}>Improving: <strong>{scorecardDeltaSummary.improving}</strong></span>
                          <span style={{ fontSize: 12, opacity: 0.9 }}>Flat: <strong>{scorecardDeltaSummary.flat}</strong></span>
                          <span style={{ fontSize: 12, opacity: 0.9 }}>Down: <strong>{scorecardDeltaSummary.down}</strong></span>
                        </div>
                      ) : null}

                      <div style={{ display: "grid", gridTemplateColumns: scorecardDeltaSummary ? "1fr auto auto" : "1fr auto", gap: 6, alignItems: "center" }}>
                        {scorecardMetrics.map((metric) => {
                          const value = Number(scorecard[metric.key] ?? 0);
                          const delta = scorecardDeltaSummary?.deltas.find((d) => d.key === metric.key)?.delta ?? null;
                          return (
                            <React.Fragment key={metric.key}>
                              <div style={{ opacity: 0.9 }}>{metric.label}</div>
                              <div><strong>{value.toFixed(1)}</strong></div>
                              {scorecardDeltaSummary ? (
                                <div>
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      minWidth: 52,
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      ...deltaTone(delta ?? 0),
                                    }}
                                  >
                                    {formatDelta(delta ?? 0)}
                                  </span>
                                </div>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                      </div>

                      <div style={{ opacity: 0.9 }}>
                        Momentum: <strong>{scorecard.momentum === "up" ? "↑ Improving" : scorecard.momentum === "down" ? "↓ Slipping" : "→ Flat"}</strong>
                        {previousScorecard ? (
                          <span style={{ opacity: 0.8 }}> • Previous: <strong>{previousScorecard.momentum === "up" ? "↑ Improving" : previousScorecard.momentum === "down" ? "↓ Slipping" : "→ Flat"}</strong></span>
                        ) : null}
                      </div>

                      {scorecard.notes ? (
                        <div style={{ opacity: 0.9, fontSize: 12, lineHeight: 1.35 }}>
                          <strong>Notes:</strong> {scorecard.notes}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, opacity: 0.85 }}>
                      No scorecard yet. Hit <strong>Scorecard</strong> above.
                    </div>
                  )}

                  {scoreShowHistory && scoreHistory.length > 0 ? (
                    <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Previous scorecards (click to load):</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {scoreHistory.map((h) => (
                          <button
                            key={h.ts}
                            style={{
                              textAlign: "left",
                              padding: "6px 10px",
                              borderRadius: 10,
                              background: "rgba(255,255,255,0.06)"
                            }}
                            onClick={() => setScorecard(h)}
                            title="Load this scorecard"
                          >
                            <span style={{ fontSize: 12, opacity: 0.9 }}>
                              {h.monthKey} • {h.ts.replace("T", " ").slice(0, 19)}Z • {h.momentum === "up" ? "↑" : h.momentum === "down" ? "↓" : "→"}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {aiInsight ? (
                <div style={{ padding: 10, borderRadius: 10, background: "rgba(0,0,0,0.25)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong>Coach Analysis</strong>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {aiInsightHistory[0]?.ts ? `Last run: ${aiInsightHistory[0].ts.replace("T", " ").slice(0, 19)}Z` : ""}
                    </div>
                  </div>
                  <pre
                    style={{
                      marginTop: 8,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "inherit",
                      fontSize: 13,
                      lineHeight: 1.35,
                      opacity: 0.95
                    }}
                  >
                    {aiInsight}
                  </pre>

                  {aiShowHistory && aiInsightHistory.length > 0 ? (
                    <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Previous coach runs (click to load):</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {aiInsightHistory.map((h) => (
                          <button
                            key={h.id}
                            style={{
                              textAlign: "left",
                              padding: "6px 10px",
                              borderRadius: 10,
                              background: "rgba(255,255,255,0.06)"
                            }}
                            onClick={() => setAiInsight(h.text)}
                            title="Load this run into the viewer"
                          >
                            <span style={{ fontSize: 12, opacity: 0.9 }}>{h.ts.replace("T", " ").slice(0, 19)}Z</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {visionText ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                    <strong>Vision Analysis</strong> — {visionPose.toUpperCase()} ({visionScope === "month" ? "month" : "last 2"}, {visionFocus})
                  </div>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      padding: 10,
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      margin: 0,
                      opacity: 0.95,
                    }}
                  >
                    {visionText}
                  </pre>

                  {visionShowHistory && visionHistory.length > 0 ? (
                    <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Previous Vision runs (click to load):</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {visionHistory.map((h) => (
                          <button
                            key={h.id}
                            style={{
                              textAlign: "left",
                              padding: "6px 10px",
                              borderRadius: 10,
                              background: "rgba(255,255,255,0.06)",
                            }}
                            onClick={() => {
                              setVisionPose(h.pose);
                              setVisionScope(h.scope as any);
                              setVisionText(h.text);
                            }}
                            title="Load this Vision run into the viewer"
                          >
                            <span style={{ fontSize: 12, opacity: 0.9 }}>
                              {h.ts.replace("T", " ").slice(0, 19)}Z • {h.pose.toUpperCase()} • {h.scope}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          </ProgressSection>

          <ProgressSection
            title="Flipbook"
            subtitle="Chronological visual proof of change, one pose at a time."
            open={flipbookOpen}
            onToggle={() => setFlipbookOpen((v) => !v)}
          >
          {/* Flipbook + Monthly highlights (keep controls, image, and timeline contiguous) */}
          <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
            <div style={{ ...bannerStyle("info") }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>Flipbook</strong>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <label>
                      Pose:{" "}
                      <select value={flipPose} onChange={(e) => setFlipPose(e.target.value as Pose)} style={{ padding: 6 }}>
                        <option value="front">Front</option>
                        <option value="quarter">Quarter Turn</option>
                        <option value="side">Side</option>
                        <option value="back">Back</option>
                      </select>
                    </label>
                    <button onClick={() => setFlipIdx((i) => Math.max(0, i - 1))} disabled={!flipList.length || flipIdx <= 0}>
                      Prev
                    </button>
                    <button onClick={() => setFlipPlaying((p) => !p)} disabled={flipList.length < 2}>
                      {flipPlaying ? "Stop" : "Play"}
                    </button>
                    <button onClick={() => setFlipIdx((i) => Math.min(Math.max(0, flipList.length - 1), i + 1))} disabled={!flipList.length || flipIdx >= flipList.length - 1}>
                      Next
                    </button>
                    <button onClick={() => setFlipIdx(Math.max(0, flipList.length - 1))} disabled={!flipList.length}>
                      Latest
                    </button>
                    <label>
                      View:{" "}
                      <select value={flipView} onChange={(e) => setFlipView(e.target.value as any)} style={{ padding: 6 }}>
                        <option value="normal">Normal</option>
                        <option value="ghost">Ghost overlay</option>
                        <option value="diff">Difference heatmap</option>
                        <option value="map">Physique change map</option>
                      </select>
                    </label>
                    {flipView !== "normal" ? (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: 0.9 }}>
                        {flipView === "ghost" ? "Opacity" : flipView === "diff" ? "Intensity" : "Map strength"}
                        <input
                          type="range"
                          min={5}
                          max={85}
                          value={ghostOpacity}
                          onChange={(e) => setGhostOpacity(Number(e.target.value))}
                          style={{ width: 140 }}
                        />
                        <span style={{ width: 34, textAlign: "right" }}>{ghostOpacity}%</span>
                      </label>
                    ) : null}
                    <span style={{ opacity: 0.75 }}>
                      {flipList.length
                        ? flipList.length === 1
                          ? "1 anchor (log one more week to play)"
                          : `${flipList.length} anchors`
                        : "No anchors yet"}
                    </span>
                    <span style={{ opacity: 0.85 }}>
                      Frame {flipList.length ? flipIdx + 1 : 0} / {flipList.length}
                    </span>
                  </div>
                </div>

                <div>
                  <strong>Monthly highlights</strong>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>Month: {monthlyHighlights.key}</div>
                  <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                    {CORE_POSES.map((p) => {
                      const h = (monthlyHighlights.highlights as any)[p] as { first?: ProgressPhotoRow; last?: ProgressPhotoRow };
                      if (!h?.first || !h?.last) {
                        return (
                          <div key={p} style={{ opacity: 0.75 }}>
                            {p.toUpperCase()}: —
                          </div>
                        );
                      }
                      return (
                        <div key={p}>
                          {p.toUpperCase()}: {h.first.taken_on} → {h.last.taken_on}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

{flipList.length ? (
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                    {[
                      { label: "Oldest anchor", row: flipList[0] },
                      { label: "Current frame", row: flipList[flipIdx] },
                      { label: "Latest anchor", row: flipList[flipList.length - 1] },
                    ].map((card) => (
                      <div
                        key={card.label}
                        style={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 10,
                          padding: 10,
                          background: "rgba(255,255,255,0.04)"
                        }}
                      >
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{card.label}</div>
                        {card.row ? (
                          <>
                            <div style={{ marginTop: 4, fontWeight: 700 }}>{card.row.taken_on}</div>
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>
                              {card.row.pose.toUpperCase()} • {card.row.weight_lbs ?? "—"} lb • {card.row.waist_in ?? "—"} in
                            </div>
                          </>
                        ) : (
                          <div style={{ marginTop: 4, opacity: 0.75 }}>—</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Video-editor style scrubber */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                    <div style={{ opacity: 0.9 }}>
                      <strong>Timeline</strong> — {flipList[flipIdx] ? `${flipList[flipIdx].taken_on} (${flipPose.toUpperCase()})` : ""}
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      Frame {flipList.length ? flipIdx + 1 : 0} / {flipList.length}
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, flipList.length - 1)}
                    value={flipIdx}
                    onChange={(e) => setFlipIdx(Number(e.target.value))}
                    style={{ width: "100%" }}
                    disabled={!flipList.length}
                  />

                  {/* Clickable markers */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4 }}>
                    {flipList.map((r, idx) => (
                      <button
                        key={r.id}
                        onClick={() => setFlipIdx(idx)}
                        title={r.taken_on}
                        style={{
                          minWidth: 10,
                          height: 10,
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.35)",
                          background: idx === flipIdx ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.15)",
                          cursor: "pointer"
                        }}
                        aria-label={`Jump to ${r.taken_on}`}
                      />
                    ))}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.65, fontSize: 12 }}>
                    <span>{flipList[0]?.taken_on ?? ""}</span>
                    <span>{flipList[flipList.length - 1]?.taken_on ?? ""}</span>
                  </div>
                </div>
              ) : null}

                            {flipList[flipIdx] && thumbs[flipList[flipIdx].id] ? (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      width: 320,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      overflow: "hidden",
                      position: "relative",
                      background: "rgba(0,0,0,0.25)"
                    }}
                  >
                    {alignGrid ? (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          pointerEvents: "none",
                          backgroundImage:
                            "linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.10) 1px, transparent 1px)",
                          backgroundSize: "50px 50px",
                          opacity: 0.35
                        }}
                      />
                    ) : null}

                    {/* Current frame */}
                    <img
                      src={thumbs[flipList[flipIdx].id]}
                      alt={`Flipbook  taken_on`}
                      style={{ width: "100%", display: "block", objectFit: "contain", transform: `translate(${alignX}px, ${alignY}px)` }}
                    />

                    {/* Ghost overlay of previous frame */}
                    {flipView === "ghost" && flipIdx > 0 ? (
                      thumbs[flipList[flipIdx - 1]?.id] ? (
                        <img
                          src={thumbs[flipList[flipIdx - 1].id]}
                          alt={`Ghost  taken_on`}
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            opacity: ghostOpacity / 100,
                            transform: `translate(${(flipList[flipIdx - 1].align_x ?? 0) as number}px, ${(flipList[flipIdx - 1].align_y ?? 0) as number}px)`,
                            pointerEvents: "none"
                          }}
                        />
                      ) : null
                    ) : null}

                    {/* Difference heatmap overlay */}
                    {(flipView === "diff" || flipView === "map") && flipIdx > 0 ? (
                      <canvas
                        ref={diffCanvasRef}
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          opacity: 0.85,
                          pointerEvents: "none",
                          mixBlendMode: "screen"
                        }}
                      />
                    ) : null}
                  </div>

                  {/* Alignment controls (Flipbook) */}
                  <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <button onClick={(e) => nudgeAlign(0, e.shiftKey ? -10 : -2)} title="Nudge up (Shift = 10px)">↑</button>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        <button onClick={(e) => nudgeAlign(e.shiftKey ? -10 : -2, 0)} title="Nudge left (Shift = 10px)">←</button>
                        <button onClick={resetAlign} title="Reset alignment">Reset</button>
                        <button onClick={(e) => nudgeAlign(e.shiftKey ? 10 : 2, 0)} title="Nudge right (Shift = 10px)">→</button>
                      </div>
                      <button onClick={(e) => nudgeAlign(0, e.shiftKey ? 10 : 2)} title="Nudge down (Shift = 10px)">↓</button>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={alignGrid} onChange={(e) => setAlignGrid(e.target.checked)} />
                        Show grid
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={flipKeysArmed} onChange={(e) => setFlipKeysArmed(e.target.checked)} />
                        Keyboard nudges
                      </label>
                    </div>

                    {flipIdx > 0 ? (
                      <button onClick={copyPrevAlignToCurrent} title="Copy previous frame alignment to this frame">
                        Copy prev alignment
                      </button>
                    ) : (
                      <button disabled title="Log another week to copy alignment">Copy prev alignment</button>
                    )}

                    <div style={{ opacity: 0.8, fontSize: 12 }}>
                      {flipKeysArmed ? "Keys: ← ↑ ↓ → (Shift=10px), R=reset" : "Enable keyboard nudges for arrow keys"}
                      <div>
                        Current offset: <strong>{alignX}</strong>, <strong>{alignY}</strong>
                      </div>
                    </div>
                  </div>

                  {flipView !== "normal" && flipIdx > 0 ? (
                    <div style={{ marginTop: 8, opacity: 0.85, fontSize: 12 }}>
                      {flipView === "ghost" ? "Ghost" : flipView === "diff" ? "Heatmap" : "Change map"}: {flipList[flipIdx - 1].taken_on} → {flipList[flipIdx].taken_on}
                    </div>
                  ) : null}

                  {flipList.length < 2 ? (
                    <div style={{ marginTop: 8, opacity: 0.85, fontSize: 12 }}>
                      Flipbook needs <strong>2+</strong> anchor weeks for this pose. Log next week’s {flipPose.toUpperCase()} to unlock playback.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          </ProgressSection>

          <ProgressSection
            title="Compare"
            subtitle="Inspect anchor photos side by side. Use Compare on any anchor in the library below."
            open={compareSectionOpen}
            onToggle={() => setCompareSectionOpen((v) => !v)}
          >
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ ...bannerStyle("info") }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Compare Library</h3>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={refreshGallery} disabled={galleryBusy}>
                    {galleryBusy ? "Refreshing..." : "Refresh"}
                  </button>
                  <span style={{ opacity: 0.75 }}>{rows.length} photos</span>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <strong>Quick Compare by Pose</strong>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                  {CORE_POSES.map((p) => {
                    const pair = latestAnchorPairByPose[p];
                    return (
                      <div
                        key={p}
                        style={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 10,
                          padding: 10,
                          background: "rgba(255,255,255,0.04)",
                          display: "grid",
                          gap: 8
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700 }}>{p === "front" ? "Front" : p === "side" ? "Side" : "Back"}</div>
                          {pair ? (
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
                              Latest anchor pair: {pair.previous.taken_on} → {pair.latest.taken_on}
                            </div>
                          ) : (
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                              Need 2 anchor weeks for one-click compare.
                            </div>
                          )}
                        </div>
                        <button onClick={() => pair && openComparePair(pair.previous, pair.latest)} disabled={!pair}>
                          Open latest pair
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label>
                  Pose filter{" "}
                  <select value={comparePoseFilter} onChange={(e) => setComparePoseFilter(e.target.value as "all" | Pose)} style={{ padding: 6 }}>
                    <option value="all">All poses</option>
                    <option value="front">Front</option>
                    <option value="quarter">Quarter Turn</option>
                    <option value="side">Side</option>
                    <option value="back">Back</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={compareAnchorsOnly} onChange={(e) => setCompareAnchorsOnly(e.target.checked)} />
                  Anchors only
                </label>
                <span style={{ opacity: 0.8 }}>Showing <strong>{compareRowsFiltered.length}</strong> of {rows.length}</span>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {compareRowsFiltered.length ? (
                compareRowsFiltered.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 10,
                      padding: 10,
                      display: "grid",
                      gap: 8
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div>
                        <strong>{r.taken_on}</strong> — {r.pose.toUpperCase()}
                        {r.is_anchor ? <span style={{ marginLeft: 8 }}>(Anchor)</span> : null}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {r.is_anchor && CORE_POSES.includes(r.pose) ? (
                          <button onClick={() => openCompareForRow(r)}>Compare</button>
                        ) : null}
                        <button onClick={() => handleDelete(r)}>Delete</button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {thumbs[r.id] ? (
                        <img
                          src={thumbs[r.id]}
                          alt={`${r.pose} ${r.taken_on}`}
                          style={{ width: 200, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)" }}
                        />
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              await ensureThumb(r.id, r.storage_path);
                            } catch (e: any) {
                              alert(e?.message ?? String(e));
                            }
                          }}
                        >
                          Load preview
                        </button>
                      )}

                      <div style={{ minWidth: 260 }}>
                        <div>Weight: {r.weight_lbs ?? "—"} lbs</div>
                        <div>Waist: {r.waist_in ?? "—"} in</div>
                        {r.notes ? <div style={{ marginTop: 6, opacity: 0.9 }}>Notes: {r.notes}</div> : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ ...bannerStyle("warn") }}>
                  No photos match the current Compare filters. Change the pose filter or turn off anchors-only.
                </div>
              )}
            </div>
          </div>

          {/* Compare modal */}
          {compareOpen && compareA && compareB ? (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                display: "grid",
                placeItems: "center",
                padding: 16,
                zIndex: 9999
              }}
              onClick={() => setCompareOpen(false)}
            >
              <div
                style={{
                  width: "min(860px, 95vw)",
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 14,
                  padding: 14
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <strong>Compare</strong> — {compareB.pose.toUpperCase()} ({compareA.taken_on} → {compareB.taken_on})
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={{ fontSize: 12, opacity: 0.9 }}>
                      View:{" "}
                      <select value={compareView} onChange={(e) => setCompareView(e.target.value as any)} style={{ padding: 6 }}>
                        <option value="slider">Slider wipe</option>
                        <option value="ghost">Ghost overlay</option>
                        <option value="map">Change map</option>
                      </select>
                    </label>
                    <button
                      onClick={async () => {
                        try {
                          await copyAlignBetweenPhotos(compareA.id, compareB.id);
                        } catch (e: any) {
                          alert(e?.message ?? String(e));
                        }
                      }}
                      title="Copy BEFORE alignment to AFTER"
                    >
                      Copy prev alignment
                    </button>
                    <button onClick={() => setCompareOpen(false)}>Close</button>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      aspectRatio: "16/10",
                      overflow: "hidden",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      background: "#111",
                      userSelect: "none"
                    }}
                  >
                    {/* Base (A) */}
                    <img
                      src={thumbs[compareA.id]}
                      alt={`Before ${compareA.taken_on}`}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        transform: `translate(${(compareA.align_x ?? 0) as number}px, ${(compareA.align_y ?? 0) as number}px)`,
                        opacity: compareView === "map" ? 0.08 : 1
                      }}
                    />

                    {compareView === "slider" ? (
                      <>
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            clipPath: `inset(0 ${Math.max(0, 100 - compareMix)}% 0 0)`,
                            WebkitClipPath: `inset(0 ${Math.max(0, 100 - compareMix)}% 0 0)`
                          }}
                        >
                          <img
                            src={thumbs[compareB.id]}
                            alt={`After ${compareB.taken_on}`}
                            onPointerDown={(e) => {
                              (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                              compareDragRef.current = {
                                active: true,
                                sx: e.clientX,
                                sy: e.clientY,
                                ax: (((compareB.align_x ?? 0) as number) || 0) as number,
                                ay: (((compareB.align_y ?? 0) as number) || 0) as number
                              };
                            }}
                            onPointerMove={(e) => {
                              const st = compareDragRef.current;
                              if (!st?.active || !compareB) return;
                              const dx = e.clientX - st.sx;
                              const dy = e.clientY - st.sy;
                              const nx = st.ax + dx;
                              const ny = st.ay + dy;
                              setCompareB({ ...compareB, align_x: nx, align_y: ny });
                              updateLocalAlign(compareB.id, nx, ny);
                              schedulePersistAlign(compareB.id, nx, ny);
                            }}
                            onPointerUp={() => {
                              if (compareDragRef.current) compareDragRef.current.active = false;
                            }}
                            onPointerCancel={() => {
                              if (compareDragRef.current) compareDragRef.current.active = false;
                            }}
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              transform: `translate(${(compareB.align_x ?? 0) as number}px, ${(compareB.align_y ?? 0) as number}px)`,
                              transition: "transform 0.02s linear",
                              cursor: "grab",
                              touchAction: "none"
                            }}
                          />
                        </div>
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: `${compareMix}%`,
                            width: 2,
                            background: "rgba(255,255,255,0.85)"
                          }}
                        />
                      </>
                    ) : compareView === "ghost" ? (
                      <img
                        src={thumbs[compareB.id]}
                        alt={`After ${compareB.taken_on}`}
                        onPointerDown={(e) => {
                          (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                          compareDragRef.current = {
                            active: true,
                            sx: e.clientX,
                            sy: e.clientY,
                            ax: (((compareB.align_x ?? 0) as number) || 0) as number,
                            ay: (((compareB.align_y ?? 0) as number) || 0) as number
                          };
                        }}
                        onPointerMove={(e) => {
                          const st = compareDragRef.current;
                          if (!st?.active || !compareB) return;
                          const dx = e.clientX - st.sx;
                          const dy = e.clientY - st.sy;
                          const nx = st.ax + dx;
                          const ny = st.ay + dy;
                          setCompareB({ ...compareB, align_x: nx, align_y: ny });
                          updateLocalAlign(compareB.id, nx, ny);
                          schedulePersistAlign(compareB.id, nx, ny);
                        }}
                        onPointerUp={() => {
                          if (compareDragRef.current) compareDragRef.current.active = false;
                        }}
                        onPointerCancel={() => {
                          if (compareDragRef.current) compareDragRef.current.active = false;
                        }}
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          opacity: compareOpacity / 100,
                          transform: `translate(${(compareB.align_x ?? 0) as number}px, ${(compareB.align_y ?? 0) as number}px)`,
                          transition: "transform 0.02s linear",
                          cursor: "grab",
                          touchAction: "none"
                        }}
                      />
                    ) : (
                      <>
                        <img
                          src={thumbs[compareB.id]}
                          alt={`After ${compareB.taken_on}`}
                          onPointerDown={(e) => {
                            (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                            compareDragRef.current = {
                              active: true,
                              sx: e.clientX,
                              sy: e.clientY,
                              ax: (((compareB.align_x ?? 0) as number) || 0) as number,
                              ay: (((compareB.align_y ?? 0) as number) || 0) as number
                            };
                          }}
                          onPointerMove={(e) => {
                            const st = compareDragRef.current;
                            if (!st?.active || !compareB) return;
                            const dx = e.clientX - st.sx;
                            const dy = e.clientY - st.sy;
                            const nx = st.ax + dx;
                            const ny = st.ay + dy;
                            setCompareB({ ...compareB, align_x: nx, align_y: ny });
                            updateLocalAlign(compareB.id, nx, ny);
                            schedulePersistAlign(compareB.id, nx, ny);
                          }}
                          onPointerUp={() => {
                            if (compareDragRef.current) compareDragRef.current.active = false;
                          }}
                          onPointerCancel={() => {
                            if (compareDragRef.current) compareDragRef.current.active = false;
                          }}
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            opacity: 0.06,
                            transform: `translate(${(compareB.align_x ?? 0) as number}px, ${(compareB.align_y ?? 0) as number}px)`,
                            transition: "transform 0.02s linear",
                            cursor: "grab",
                            touchAction: "none"
                          }}
                        />
                        <canvas
                          ref={compareMapCanvasRef}
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            opacity: 0.96,
                            pointerEvents: "none",
                            mixBlendMode: "screen"
                          }}
                        />
                      </>
                    )}
                  </div>

                  {/* Alignment controls */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      <b>Align:</b> drag the top photo, or nudge with buttons (double‑click = bigger). “Reset” zeros alignment for the top photo.
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button className="btn" onClick={() => compareNudge(0, -2)} onDoubleClick={() => compareNudge(0, -10)} title="Up">↑</button>
                      <button className="btn" onClick={() => compareNudge(-2, 0)} onDoubleClick={() => compareNudge(-10, 0)} title="Left">←</button>
                      <button className="btn" onClick={() => compareNudge(2, 0)} onDoubleClick={() => compareNudge(10, 0)} title="Right">→</button>
                      <button className="btn" onClick={() => compareNudge(0, 2)} onDoubleClick={() => compareNudge(0, 10)} title="Down">↓</button>
                      <button className="btn" onClick={compareReset} title="Reset alignment">Reset</button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ opacity: 0.85 }}>{compareA.taken_on}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={compareView === "slider" ? compareMix : compareOpacity}
                      onChange={(e) => compareView === "slider" ? setCompareMix(Number(e.target.value)) : setCompareOpacity(Number(e.target.value))}
                      style={{ width: 320 }}
                    />
                    <span style={{ opacity: 0.85 }}>{compareView === "slider" ? `Wipe ${compareMix}%` : compareView === "ghost" ? `Opacity ${compareOpacity}%` : `Map ${compareOpacity}%`}</span>
                    <span style={{ opacity: 0.85 }}>{compareB.taken_on}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          </ProgressSection>
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





























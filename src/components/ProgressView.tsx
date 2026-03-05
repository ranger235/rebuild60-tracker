import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { localdb } from "../localdb";

type Pose = "front" | "side" | "back" | "other";

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

const CORE_POSES: Pose[] = ["front", "side", "back"];
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

  // Measurements state
  const [mBusy, setMBusy] = useState(false);
  const [mRow, setMRow] = useState<Partial<MeasurementRow>>({});

  // Compare / Flipbook state
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState<ProgressPhotoRow | null>(null);
  const [compareB, setCompareB] = useState<ProgressPhotoRow | null>(null);
  const [compareMix, setCompareMix] = useState(50);

  const [flipPose, setFlipPose] = useState<Pose>("front");
  const [flipPlaying, setFlipPlaying] = useState(false);
  const [flipIdx, setFlipIdx] = useState(0);

  const [flipView, setFlipView] = useState<"normal" | "ghost" | "diff">("normal");
  const [ghostOpacity, setGhostOpacity] = useState(35); // % overlay OR heatmap intensity

  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- Derived windows ---
  const weekWindow = useMemo(() => getWeekWindowForDate(dayDate, checkinDow), [dayDate, checkinDow]);

  useEffect(() => {
    // Persist settings per user
    setCheckinDowState(getCheckinDow(userId));
  }, [userId]);

  // Difference-mode heatmap renderer
  useEffect(() => {
    if (flipView !== "diff") return;
    if (flipIdx <= 0) return;
    const cur = flipList[flipIdx];
    const prev = flipList[flipIdx - 1];
    if (!cur || !prev) return;
    const curUrl = thumbs[cur.id];
    const prevUrl = thumbs[prev.id];
    const canvas = diffCanvasRef.current;
    if (!canvas || !curUrl || !prevUrl) return;

    let cancelled = false;
    (async () => {
      const loadImg = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });

      try {
        const [imgA, imgB] = await Promise.all([loadImg(prevUrl), loadImg(curUrl)]);
        if (cancelled) return;

        const w = 320;
        const h = Math.round((w * imgB.naturalHeight) / Math.max(1, imgB.naturalWidth));
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const offA = document.createElement("canvas");
        const offB = document.createElement("canvas");
        offA.width = w;
        offA.height = h;
        offB.width = w;
        offB.height = h;
        const ctxA = offA.getContext("2d");
        const ctxB = offB.getContext("2d");
        if (!ctxA || !ctxB) return;

        // Draw both to the same output size (contain-style)
        const drawContain = (c: CanvasRenderingContext2D, img: HTMLImageElement) => {
          c.clearRect(0, 0, w, h);
          const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          const dx = (w - dw) / 2;
          const dy = (h - dh) / 2;
          c.drawImage(img, dx, dy, dw, dh);
        };

        drawContain(ctxA, imgA);
        drawContain(ctxB, imgB);

        const a = ctxA.getImageData(0, 0, w, h);
        const b = ctxB.getImageData(0, 0, w, h);
        const out = ctx.createImageData(w, h);

        const scale = Math.max(0.2, Math.min(2.0, ghostOpacity / 35));

        for (let i = 0; i < out.data.length; i += 4) {
          const dr = Math.abs(b.data[i] - a.data[i]);
          const dg = Math.abs(b.data[i + 1] - a.data[i + 1]);
          const db = Math.abs(b.data[i + 2] - a.data[i + 2]);
          let d = (dr + dg + db) / 3;
          d = Math.min(255, d * 3 * scale);

          // Heatmap: red -> yellow based on intensity
          out.data[i] = 255;
          out.data[i + 1] = Math.min(255, Math.round(d));
          out.data[i + 2] = 0;
          out.data[i + 3] = Math.min(255, Math.round(d));
        }

        ctx.clearRect(0, 0, w, h);
        ctx.putImageData(out, 0, 0);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipView, flipIdx, ghostOpacity, thumbs]);

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
    const byPose: Record<Pose, ProgressPhotoRow[]> = { front: [], side: [], back: [], other: [] };
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
    const by: Record<Pose, ProgressPhotoRow[]> = { front: [], side: [], back: [], other: [] };
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

      // Anchor rule: For Front/Side/Back, mark the FIRST photo in the current week as is_anchor.
      let is_anchor: boolean | null = null;
      if (CORE_POSES.includes(pose)) {
        const { weekStart, weekEnd } = getWeekWindowForDate(dayDate, checkinDow);
        const already = rows.some(
          (r) => r.pose === pose && inRange(r.taken_on, weekStart, weekEnd) && (r.is_anchor ?? false)
        );
        is_anchor = already ? false : true;
      }

      const { error: insErr } = await supabase.from("progress_photos").insert({
        user_id: userId,
        taken_on: dayDate,
        pose,
        storage_path: path,
        weight_lbs: Number.isFinite(wl as any) ? wl : null,
        waist_in: Number.isFinite(wi as any) ? wi : null,
        notes: notes.trim() ? notes.trim() : null,
        is_anchor
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

  if (!userId) {
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
          {/* Weekly Check-in Meter */}
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
                    Upload all 3 poses to unlock: <strong>Compare mode</strong>, <strong>Flipbook</strong>, and <strong>Monthly highlights</strong>.
                  </div>
                ) : (
                  <div style={{ marginTop: 8, opacity: 0.9 }}>
                    ✅ Week complete. Your future self is going to love this.
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
                <option value="side">Side</option>
                <option value="back">Back</option>
                <option value="other">Other</option>
              </select>
              <span style={{ marginLeft: 10, opacity: 0.75 }}>
                {CORE_POSES.includes(pose)
                  ? "Counts toward Weekly Check-In (and becomes an Anchor for that week if it's the first)"
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

          {/* Compare / Flipbook / Monthly */}
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
                        <option value="side">Side</option>
                        <option value="back">Back</option>
                      </select>
                    </label>
                    <button onClick={() => setFlipPlaying((p) => !p)} disabled={flipList.length < 2}>
                      {flipPlaying ? "Stop" : "Play"}
                    </button>
                    <label>
                      View:{" "}
                      <select value={flipView} onChange={(e) => setFlipView(e.target.value as any)} style={{ padding: 6 }}>
                        <option value="normal">Normal</option>
                        <option value="ghost">Ghost overlay</option>
                        <option value="diff">Difference heatmap</option>
                      </select>
                    </label>
                    {flipView !== "normal" ? (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: 0.9 }}>
                        {flipView === "ghost" ? "Opacity" : "Intensity"}
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
                <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={async () => {
                      const r = flipList[flipIdx];
                      try {
                        await ensureThumb(r.id, r.storage_path);
                      } catch {}
                      setFlipIdx((i) => Math.max(0, Math.min(flipList.length - 1, i)));
                    }}
                    disabled={!flipList.length}
                  >
                    Load current frame
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, flipList.length - 1)}
                    value={flipIdx}
                    onChange={(e) => setFlipIdx(Number(e.target.value))}
                    style={{ width: 260 }}
                    disabled={!flipList.length}
                  />
                  <span style={{ opacity: 0.85 }}>
                    {flipList[flipIdx] ? `${flipList[flipIdx].taken_on} (${flipPose.toUpperCase()})` : ""}
                  </span>
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
                    /* Current frame */
                    <img
                      src={thumbs[flipList[flipIdx].id]}
                      alt={`Flipbook  taken_on`}
                      style={{ width: "100%", display: "block" }}
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
                            pointerEvents: "none"
                          }}
                        />
                      ) : null
                    ) : null}

                    {/* Difference heatmap overlay */}
                    {flipView === "diff" && flipIdx > 0 ? (
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

                  {flipView !== "normal" && flipIdx > 0 ? (
                    <div style={{ marginTop: 8, opacity: 0.85, fontSize: 12 }}>
                      {flipView === "ghost" ? "Ghost" : "Heatmap"}: {flipList[flipIdx - 1].taken_on} → {flipList[flipIdx].taken_on}
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

          {/* Gallery */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Gallery</h3>
            <button onClick={refreshGallery} disabled={galleryBusy}>
              {galleryBusy ? "Refreshing..." : "Refresh"}
            </button>
            <span style={{ opacity: 0.75 }}>{rows.length} photos</span>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {rows.map((r) => (
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
            ))}
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
                  <button onClick={() => setCompareOpen(false)}>Close</button>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  <div style={{ position: "relative", width: "100%", aspectRatio: "16/10", overflow: "hidden", borderRadius: 12 }}>
                    {/* Base (A) */}
                    <img
                      src={thumbs[compareA.id]}
                      alt={`Before ${compareA.taken_on}`}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                    />
                    {/* Overlay (B), clipped */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: `${compareMix}%`,
                        overflow: "hidden"
                      }}
                    >
                      <img
                        src={thumbs[compareB.id]}
                        alt={`After ${compareB.taken_on}`}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    </div>
                    {/* Divider */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${compareMix}%`,
                        width: 2,
                        background: "rgba(255,255,255,0.6)"
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ opacity: 0.85 }}>{compareA.taken_on}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={compareMix}
                      onChange={(e) => setCompareMix(Number(e.target.value))}
                      style={{ width: 320 }}
                    />
                    <span style={{ opacity: 0.85 }}>{compareB.taken_on}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
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




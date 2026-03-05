import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { localdb, type LocalDailyMetrics } from "../localdb";

type Pose = "front" | "side" | "back" | "other";

type ProgressPhotoRow = {
  id: string;
  taken_on: string;
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

async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  // Basic client-side compression to keep storage/bandwidth sane.
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

function isoWeekStart(day: string, weekStartsOnSunday: boolean): string {
  // day: YYYY-MM-DD
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const dow = dt.getDay(); // 0 Sun .. 6 Sat
  const delta = weekStartsOnSunday ? -dow : -(dow === 0 ? 6 : dow - 1); // Monday start
  dt.setDate(dt.getDate() + delta);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

  // Photo form state
  const [pose, setPose] = useState<Pose>("front");
  const [weightLbs, setWeightLbs] = useState<string>("");
  const [waistIn, setWaistIn] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [uploadBusy, setUploadBusy] = useState(false);

  // Gallery state
  const [rows, setRows] = useState<ProgressPhotoRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [galleryBusy, setGalleryBusy] = useState(false);

  // Measurements state
  const [mBusy, setMBusy] = useState(false);
  const [mRow, setMRow] = useState<Partial<MeasurementRow>>({});

  const weekStart = useMemo(() => isoWeekStart(dayDate, true), [dayDate]);

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

  async function refreshGallery() {
    if (!userId) return;
    setGalleryBusy(true);
    try {
      const { data, error } = await supabase
        .from("progress_photos")
        .select("*")
        .order("taken_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      const list = (data ?? []) as any as ProgressPhotoRow[];
      setRows(list);

      // Refresh signed URLs
      const next: Record<string, string> = {};
      for (const r of list.slice(0, 60)) {
        // Only sign a limited number for performance; rest sign on demand later.
        const { data: s, error: se } = await supabase.storage
          .from("progress-photos")
          .createSignedUrl(r.storage_path, 60 * 60);
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
        .eq("taken_on", dayDate)
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error; // PGRST116: no rows
      if (data) setMRow(data as any);
      else {
        // default from Quick Log for same day
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

      const { error: insErr } = await supabase.from("progress_photos").insert({
        user_id: userId,
        taken_on: dayDate,
        pose,
        storage_path: path,
        weight_lbs: Number.isFinite(wl as any) ? wl : null,
        waist_in: Number.isFinite(wi as any) ? wi : null,
        notes: notes.trim() ? notes.trim() : null
      });

      if (insErr) throw insErr;

      // cleanup
      if (fileRef.current) fileRef.current.value = "";
      await refreshGallery();
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
      // 1) delete storage
      const { error: delErr } = await supabase.storage.from("progress-photos").remove([r.storage_path]);
      if (delErr) throw delErr;

      // 2) delete metadata row
      const { error: rowErr } = await supabase.from("progress_photos").delete().eq("id", r.id);
      if (rowErr) throw rowErr;

      // 3) delete AI reviews (future table) - ignore if not present
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

  if (!userId) {
    return (
      <div>
        <h3>Progress</h3>
        <p>Please sign in to use Progress Photos and Measurements.</p>
      </div>
    );
  }

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

      <div style={{ marginTop: 10 }}>
        <label>
          Date:{" "}
          <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} style={{ padding: 6 }} />
        </label>
        <span style={{ marginLeft: 10, opacity: 0.75 }}>Week starts: {weekStart} (Sun default)</span>
      </div>

      <hr />

      {mode === "photos" && (
        <div>
          <h3>Upload Photo</h3>

          <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
            <label>
              Pose (required for weekly anchors later):{" "}
              <select value={pose} onChange={(e) => setPose(e.target.value as Pose)} style={{ padding: 6 }}>
                <option value="front">Front</option>
                <option value="side">Side</option>
                <option value="back">Back</option>
                <option value="other">Other</option>
              </select>
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
                  alert("Auto-filled from Quick Log (local).");
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
                        const { data: s, error: se } = await supabase.storage
                          .from("progress-photos")
                          .createSignedUrl(r.storage_path, 60 * 60);
                        if (se) alert(se.message);
                        else if (s?.signedUrl) setThumbs((p) => ({ ...p, [r.id]: s.signedUrl }));
                      }}
                    >
                      Load preview
                    </button>
                  )}

                  <div style={{ minWidth: 240 }}>
                    <div>Weight: {r.weight_lbs ?? "—"} lbs</div>
                    <div>Waist: {r.waist_in ?? "—"} in</div>
                    {r.notes ? <div style={{ marginTop: 6, opacity: 0.9 }}>Notes: {r.notes}</div> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "measures" && (
        <div>
          <h3>Measurements</h3>
          <p style={{ opacity: 0.8 }}>
            One set per day. Auto-fills weight/waist from Quick Log when available.
          </p>

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
                    {label}:{" "}
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

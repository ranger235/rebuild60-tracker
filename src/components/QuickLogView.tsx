import { RefObject } from "react";

type Props = {
  weight: string;
  setWeight: (v: string) => void;
  waist: string;
  setWaist: (v: string) => void;
  sleepHours: string;
  setSleepHours: (v: string) => void;
  calories: string;
  setCalories: (v: string) => void;
  protein: string;
  setProtein: (v: string) => void;
  z2Minutes: string;
  setZ2Minutes: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;

  saveQuickLog: () => void | Promise<void>;

  exportBackup: () => void | Promise<void>;
  backupBusy: boolean;
  importFileRef: RefObject<HTMLInputElement>;
  importBackupFile: (f: File) => void | Promise<void>;

  secs: number;
  setSecs: (v: number) => void;
  timerOn: boolean;
  setTimerOn: (v: boolean | ((v: boolean) => boolean)) => void;
};

export default function QuickLogView(props: Props) {
  const {
    weight, setWeight,
    waist, setWaist,
    sleepHours, setSleepHours,
    calories, setCalories,
    protein, setProtein,
    z2Minutes, setZ2Minutes,
    notes, setNotes,
    saveQuickLog,
    exportBackup, backupBusy, importFileRef, importBackupFile,
    secs, setSecs, timerOn, setTimerOn,
  } = props;

  return (
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
  );
}

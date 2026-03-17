import React from "react";

export default function ProgressLibrary(props: any) {
  const { compareRowsFiltered, CORE_POSES, openCompareForRow, handleDelete, thumbs, ensureThumb, bannerStyle } = props;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {compareRowsFiltered.length ? (
        compareRowsFiltered.map((r: any) => (
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
  );
}

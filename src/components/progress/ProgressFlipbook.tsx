import React from "react";

export default function ProgressFlipbook(props: any) {
  const {
    ProgressSection, bannerStyle, flipbookOpen, onToggle, flipPose, setFlipPose, flipList, flipIdx, setFlipIdx,
    flipPlaying, setFlipPlaying, flipView, setFlipView, ghostOpacity, setGhostOpacity, monthlyHighlights,
    CORE_POSES, thumbs, alignGrid, alignX, alignY, diffCanvasRef, nudgeAlign, resetAlign, setAlignGrid,
    flipKeysArmed, setFlipKeysArmed, copyPrevAlignToCurrent
  } = props;

  return (
    <ProgressSection
      title="Flipbook"
      subtitle="Chronological visual proof of change, one pose at a time."
      open={flipbookOpen}
      onToggle={onToggle}
    >
      <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
        <div style={{ ...bannerStyle("info") }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong>Flipbook</strong>
              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <label>
                  Pose:{" "}
                  <select value={flipPose} onChange={(e) => setFlipPose(e.target.value)} style={{ padding: 6 }}>
                    <option value="front">Front</option>
                    <option value="quarter">Quarter Turn</option>
                    <option value="side">Side</option>
                    <option value="back">Back</option>
                  </select>
                </label>
                <button onClick={() => setFlipIdx((i: number) => Math.max(0, i - 1))} disabled={!flipList.length || flipIdx <= 0}>Prev</button>
                <button onClick={() => setFlipPlaying((p: boolean) => !p)} disabled={flipList.length < 2}>
                  {flipPlaying ? "Stop" : "Play"}
                </button>
                <button onClick={() => setFlipIdx((i: number) => Math.min(Math.max(0, flipList.length - 1), i + 1))} disabled={!flipList.length || flipIdx >= flipList.length - 1}>Next</button>
                <button onClick={() => setFlipIdx(Math.max(0, flipList.length - 1))} disabled={!flipList.length}>Latest</button>
                <label>
                  View:{" "}
                  <select value={flipView} onChange={(e) => setFlipView(e.target.value)} style={{ padding: 6 }}>
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
                  {flipList.length ? (flipList.length === 1 ? "1 anchor (log one more week to play)" : `${flipList.length} anchors`) : "No anchors yet"}
                </span>
                <span style={{ opacity: 0.85 }}>Frame {flipList.length ? flipIdx + 1 : 0} / {flipList.length}</span>
              </div>
            </div>

            <div>
              <strong>Monthly highlights</strong>
              <div style={{ marginTop: 6, opacity: 0.9 }}>Month: {monthlyHighlights.key}</div>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                {CORE_POSES.map((p: any) => {
                  const h = monthlyHighlights.highlights[p] as { first?: any; last?: any };
                  if (!h?.first || !h?.last) {
                    return <div key={p} style={{ opacity: 0.75 }}>{p.toUpperCase()}: —</div>;
                  }
                  return <div key={p}>{p.toUpperCase()}: {h.first.taken_on} → {h.last.taken_on}</div>;
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
                ].map((card: any) => (
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

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                <div style={{ opacity: 0.9 }}>
                  <strong>Timeline</strong> — {flipList[flipIdx] ? `${flipList[flipIdx].taken_on} (${flipPose.toUpperCase()})` : ""}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>Frame {flipList.length ? flipIdx + 1 : 0} / {flipList.length}</div>
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

              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4 }}>
                {flipList.map((r: any, idx: number) => (
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

                <img
                  src={thumbs[flipList[flipIdx].id]}
                  alt={`Flipbook ${flipList[flipIdx].taken_on}`}
                  style={{ width: "100%", display: "block", objectFit: "contain", transform: `translate(${alignX}px, ${alignY}px)` }}
                />

                {flipView === "ghost" && flipIdx > 0 ? (
                  thumbs[flipList[flipIdx - 1]?.id] ? (
                    <img
                      src={thumbs[flipList[flipIdx - 1].id]}
                      alt={`Ghost ${flipList[flipIdx - 1].taken_on}`}
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

              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button onClick={(e: any) => nudgeAlign(0, e.shiftKey ? -10 : -2)} title="Nudge up (Shift = 10px)">↑</button>
                  <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                    <button onClick={(e: any) => nudgeAlign(e.shiftKey ? -10 : -2, 0)} title="Nudge left (Shift = 10px)">←</button>
                    <button onClick={resetAlign} title="Reset alignment">Reset</button>
                    <button onClick={(e: any) => nudgeAlign(e.shiftKey ? 10 : 2, 0)} title="Nudge right (Shift = 10px)">→</button>
                  </div>
                  <button onClick={(e: any) => nudgeAlign(0, e.shiftKey ? 10 : 2)} title="Nudge down (Shift = 10px)">↓</button>
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
  );
}

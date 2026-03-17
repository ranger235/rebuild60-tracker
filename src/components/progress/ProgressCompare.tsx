import React from "react";
import ProgressLibrary from "./ProgressLibrary";

export default function ProgressCompare(props: any) {
  const {
    ProgressSection, bannerStyle, compareSectionOpen, onToggle, refreshGallery, galleryBusy, rows, CORE_POSES,
    latestAnchorPairByPose, openComparePair, comparePoseFilter, setComparePoseFilter, compareAnchorsOnly,
    setCompareAnchorsOnly, compareRowsFiltered, openCompareForRow, handleDelete, thumbs, ensureThumb, compareOpen,
    compareA, compareB, setCompareOpen, compareView, setCompareView, copyAlignBetweenPhotos, compareMix,
    setCompareMix, compareOpacity, setCompareOpacity, compareDragRef, setCompareB, updateLocalAlign,
    schedulePersistAlign, compareMapCanvasRef, compareNudge, compareReset
  } = props;

  const handleComparePointerDown = (e: any) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    compareDragRef.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      ax: (((compareB?.align_x ?? 0) as number) || 0) as number,
      ay: (((compareB?.align_y ?? 0) as number) || 0) as number
    };
  };

  const handleComparePointerMove = (e: any) => {
    const st = compareDragRef.current;
    if (!st?.active || !compareB) return;
    const dx = e.clientX - st.sx;
    const dy = e.clientY - st.sy;
    const nx = st.ax + dx;
    const ny = st.ay + dy;
    setCompareB({ ...compareB, align_x: nx, align_y: ny });
    updateLocalAlign(compareB.id, nx, ny);
    schedulePersistAlign(compareB.id, nx, ny);
  };

  const handleComparePointerEnd = () => {
    if (compareDragRef.current) compareDragRef.current.active = false;
  };

  return (
    <ProgressSection
      title="Compare"
      subtitle="Inspect anchor photos side by side. Use Compare on any anchor in the library below."
      open={compareSectionOpen}
      onToggle={onToggle}
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
              {CORE_POSES.map((p: any) => {
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
              <select value={comparePoseFilter} onChange={(e) => setComparePoseFilter(e.target.value)} style={{ padding: 6 }}>
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

        <ProgressLibrary
          compareRowsFiltered={compareRowsFiltered}
          CORE_POSES={CORE_POSES}
          openCompareForRow={openCompareForRow}
          handleDelete={handleDelete}
          thumbs={thumbs}
          ensureThumb={ensureThumb}
          bannerStyle={bannerStyle}
        />
      </div>

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
                  <select value={compareView} onChange={(e) => setCompareView(e.target.value)} style={{ padding: 6 }}>
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
                        onPointerDown={handleComparePointerDown}
                        onPointerMove={handleComparePointerMove}
                        onPointerUp={handleComparePointerEnd}
                        onPointerCancel={handleComparePointerEnd}
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
                    onPointerDown={handleComparePointerDown}
                    onPointerMove={handleComparePointerMove}
                    onPointerUp={handleComparePointerEnd}
                    onPointerCancel={handleComparePointerEnd}
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
                      onPointerDown={handleComparePointerDown}
                      onPointerMove={handleComparePointerMove}
                      onPointerUp={handleComparePointerEnd}
                      onPointerCancel={handleComparePointerEnd}
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

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  <b>Align:</b> drag the top photo, or nudge with buttons (double-click = bigger). “Reset” zeros alignment for the top photo.
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
  );
}

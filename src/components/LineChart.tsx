type LineChartPoint = { xLabel: string; y: number };

export type { LineChartPoint };

export default function LineChart({
  title,
  points,
  height = 120
}: {
  title: string;
  points: LineChartPoint[];
  height?: number;
}) {
  const width = 340;
  const pad = 18;

  if (!points || points.length === 0) {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>No data yet.</div>
      </div>
    );
  }

  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || 1;

  const scaleX = (i: number) => pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1);
  const scaleY = (y: number) => height - pad - ((y - minY) * (height - pad * 2)) / span;

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(1)} ${scaleY(p.y).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {last?.xLabel}: <b>{last?.y}</b>
        </div>
      </div>

      <svg width={width} height={height} style={{ marginTop: 8 }}>
        <path d={d} fill="none" stroke="black" strokeWidth={2} />
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.75 }}>
        <span>
          min <b>{minY}</b>
        </span>
        <span>
          max <b>{maxY}</b>
        </span>
      </div>
    </div>
  );
}

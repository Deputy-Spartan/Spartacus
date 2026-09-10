"use client";

interface SimpleLineChartProps {
  data: number[];
  labels?: string[];
  color?: string;
}

// Hand-rolled inline SVG line chart — no charting library. Normalizes the
// data into a 0-100 viewBox and draws a single polyline, with a dot per
// point and a light gridline baseline.
export function SimpleLineChart({ data, labels, color = "#22d3ee" }: SimpleLineChartProps) {
  if (data.length < 2) {
    return <p className="text-sm text-slate-500 py-8 text-center">Not enough data yet — check back tomorrow.</p>;
  }

  const width = 100;
  const height = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return { x, y };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-40">
        <line x1="0" y1={height} x2={width} y2={height} stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
        <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1" fill={color} />
        ))}
      </svg>
      {labels && (
        <div className="flex justify-between text-[10px] text-slate-600 mt-1">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>Min {min.toLocaleString()}</span>
        <span>Max {max.toLocaleString()}</span>
      </div>
    </div>
  );
}

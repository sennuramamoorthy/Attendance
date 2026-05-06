interface TrendLine {
  code: string;
  name: string;
  color: string;
  values: number[];
}

interface TrendChartProps {
  weeks: string[];
  lines: TrendLine[];
  /** y-axis range; defaults to a sensible 80–100% window for attendance data */
  yMin?: number;
  yMax?: number;
}

const W = 800; // SVG viewBox width
const H = 320; // SVG viewBox height
const PAD_T = 30;
const PAD_R = 60;
const PAD_B = 40;
const PAD_L = 30;

export function TrendChart({ weeks, lines, yMin, yMax }: TrendChartProps) {
  // Auto-fit the y-window to the data with a small headroom, falling back
  // to 80–100% if explicit bounds aren't provided. This keeps single-line
  // charts (only one school with data) from sitting flat at the top edge.
  const allValues = lines.flatMap((l) => l.values);
  const dataMin = allValues.length > 0 ? Math.min(...allValues) : 80;
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 100;
  const span = Math.max(10, dataMax - dataMin);
  const minY = yMin ?? Math.max(0, Math.floor((dataMin - span * 0.2) / 5) * 5);
  const maxY = yMax ?? Math.min(100, Math.ceil((dataMax + span * 0.2) / 5) * 5);

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const stepX = weeks.length > 1 ? innerW / (weeks.length - 1) : 0;

  // 4 evenly-spaced gridlines across the auto-fit range
  const gridYs = [0, 1, 2, 3].map((i) =>
    Math.round(minY + ((maxY - minY) * (i + 1)) / 5)
  );
  const yScale = (v: number) =>
    PAD_T + innerH - ((v - minY) / (maxY - minY)) * innerH;
  const xScale = (i: number) => PAD_L + i * stepX;

  function pathFor(values: number[]): string {
    return values
      .map((v, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`)
      .join(" ");
  }

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
        {lines.map((l) => (
          <div key={l.code} className="flex items-center gap-1.5 text-[11px] font-mono">
            <span
              className="w-2 h-2 rounded-sm"
              style={{ background: l.color }}
            />
            <span className="font-semibold text-ink-2">{l.code}</span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="School attendance trend">
        {/* Y gridlines */}
        {gridYs.map((y) => (
          <g key={y}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yScale(y)}
              y2={yScale(y)}
              stroke="rgba(28,32,82,0.06)"
              strokeWidth={1}
            />
            <text
              x={W - PAD_R + 6}
              y={yScale(y) + 3}
              fontSize={11}
              fill="rgba(111,117,150,0.7)"
              fontFamily="JetBrains Mono, monospace"
            >
              {y}%
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {weeks.map((w, i) => (
          <text
            key={w}
            x={xScale(i)}
            y={H - PAD_B + 18}
            fontSize={11}
            fill="rgba(111,117,150,0.8)"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="middle"
          >
            {w}
          </text>
        ))}

        {/* Lines */}
        {lines.map((l) => (
          <g key={l.code}>
            <path
              d={pathFor(l.values)}
              fill="none"
              stroke={l.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {l.values.map((v, i) => (
              <circle
                key={i}
                cx={xScale(i)}
                cy={yScale(v)}
                r={2.5}
                fill={l.color}
              />
            ))}
            {/* Trailing label (last point) */}
            {l.values.length > 0 && (
              <text
                x={xScale(l.values.length - 1) + 6}
                y={yScale(l.values[l.values.length - 1]) + 3}
                fontSize={10}
                fill={l.color}
                fontWeight={600}
              >
                {l.code}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

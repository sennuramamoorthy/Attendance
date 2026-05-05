import { GlassCard } from "./glass-card";

interface HeatmapRow {
  label: string;
  values: number[];
}

interface HeatmapProps {
  rows: HeatmapRow[];
  columnLabels: string[];
  title?: string;
}

function heatColor(v: number): string {
  const a = Math.max(0.18, v);
  if (v > 0.92) return `rgba(15,184,143,${a})`;
  if (v > 0.85) return `rgba(109,76,255,${a})`;
  return `rgba(255,107,166,${a})`;
}

export function Heatmap({ rows, columnLabels, title }: HeatmapProps) {
  return (
    <GlassCard>
      {title && <h3 className="font-bold mb-4">{title}</h3>}
      <div
        className="grid gap-1 font-mono text-[10px]"
        style={{
          gridTemplateColumns: `90px repeat(${columnLabels.length}, 1fr)`,
        }}
      >
        <div />
        {columnLabels.map((label) => (
          <div
            key={label}
            className="grid place-items-center text-muted uppercase font-semibold"
          >
            {label}
          </div>
        ))}
        {rows.map((row) => (
          <>
            <div
              key={`${row.label}-label`}
              className="grid place-items-center text-muted font-semibold"
            >
              {row.label}
            </div>
            {row.values.map((v, i) => (
              <div
                key={`${row.label}-${i}`}
                className="aspect-[1.6/1] rounded-lg grid place-items-center text-white font-semibold text-[10px]"
                style={{ backgroundColor: heatColor(v) }}
              >
                {Math.round(v * 100)}
              </div>
            ))}
          </>
        ))}
      </div>
    </GlassCard>
  );
}

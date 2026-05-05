import { GlassCard } from "./glass-card";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "good" | "warn" | "bad";
}

export function KpiCard({ label, value, delta, deltaType = "good" }: KpiCardProps) {
  const deltaColors = {
    good: "text-good bg-good/12",
    warn: "text-amber bg-amber/12",
    bad: "text-bad bg-bad/12",
  };

  return (
    <GlassCard>
      <div className="font-semibold text-[11px] text-muted uppercase tracking-[0.12em]">
        {label}
      </div>
      <div className="text-[34px] font-extrabold tracking-tight mt-1.5 leading-none bg-gradient-to-br from-ink to-accent bg-clip-text text-transparent">
        {value}
      </div>
      {delta && (
        <span
          className={`inline-flex items-center gap-1 mt-2 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${deltaColors[deltaType]}`}
        >
          {delta}
        </span>
      )}
    </GlassCard>
  );
}

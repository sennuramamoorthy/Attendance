import { serverApi } from "@/lib/api/server";
import type { VcOverview } from "@/lib/api/types";
import { GlassCard } from "@/components/ui/glass-card";
import { TrendChart } from "@/components/ui/trend-chart";

const STATUS_PILL: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  pending: { label: "Pending", bg: "bg-accent/14", text: "text-accent" },
  approved: { label: "Approved", bg: "bg-good/18", text: "text-[#0a8a6b]" },
  draft: { label: "Draft", bg: "bg-white/60 border border-white/70", text: "text-ink-2" },
};

const ACTION_PILL: Record<
  string,
  { bg: string; text: string }
> = {
  Open: { bg: "bg-gradient-to-br from-accent to-accent-2", text: "text-white" },
  Review: { bg: "bg-white/60 border border-white/70", text: "text-ink-2" },
};

export default async function ExecutiveDashboard() {
  const data = await serverApi<VcOverview>("/api/executive/vc-overview");

  if (!data) {
    return (
      <div className="text-center py-20">
        <h2>Unable to load overview</h2>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
            Vice-Chancellor &middot; Strategic
          </p>
          <h1 className="mt-1">University performance</h1>
        </div>
        <div className="inline-flex bg-white/55 border border-white/70 rounded-full p-1 backdrop-blur-[10px]">
          <button className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-white text-ink shadow-[0_4px_14px_rgba(28,32,82,0.08)]">
            Term 2
          </button>
          <button className="text-xs font-semibold px-3.5 py-1.5 rounded-full text-muted">
            YTD
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiTile
          label="Attendance YTD"
          value={`${data.attendance_ytd}%`}
          delta={`▲ ${data.attendance_ytd_yoy_delta.toFixed(1)}% YoY`}
          deltaTone="good"
        />
        <KpiTile
          label="Faculty Compliance"
          value={`${data.faculty_compliance_pct}%`}
          delta={`vs target ${data.faculty_compliance_target}%`}
          deltaTone="good"
        />
        <KpiTile
          label="At-Risk Students"
          value={String(data.at_risk_count)}
          delta={`▼ ${Math.abs(data.at_risk_wow_delta)} WoW`}
          deltaTone="good"
        />
        <KpiTile
          label="Compliance Flags"
          value={String(data.compliance_flags.length)}
          delta={`${data.compliance_critical_count} critical`}
          deltaTone={data.compliance_critical_count > 0 ? "warn" : "good"}
        />
      </div>

      {/* Trend + League */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2>Schools &middot; semester trend</h2>
            <div className="inline-flex bg-white/55 border border-white/70 rounded-full p-1">
              <button className="text-xs font-semibold px-3 py-1 rounded-full bg-white text-ink shadow-[0_4px_14px_rgba(28,32,82,0.08)]">
                Lines
              </button>
              <button className="text-xs font-semibold px-3 py-1 rounded-full text-muted">
                Stack
              </button>
            </div>
          </div>
          <TrendChart weeks={data.trend.weeks} lines={data.trend.lines} />
        </GlassCard>

        <GlassCard>
          <h2 className="mb-3">Schools league</h2>
          <ol className="space-y-3">
            {data.schools_league.map((s, i) => (
              <li
                key={s.code}
                className="flex items-center gap-3 text-sm"
              >
                <span className="font-mono text-[11px] text-muted font-semibold w-5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: s.color }}
                />
                <span className="font-semibold flex-1 truncate">{s.name}</span>
                <span className="font-bold tabular-nums">
                  {s.percentage != null ? `${Math.round(s.percentage)}%` : "—"}
                </span>
              </li>
            ))}
          </ol>
        </GlassCard>
      </div>

      {/* Compliance flags + Council agenda */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard>
          <h2 className="mb-4">Compliance flags</h2>
          <div className="space-y-3">
            {data.compliance_flags.map((f) => {
              const isCritical = f.severity === "critical";
              const action = ACTION_PILL[f.action] ?? ACTION_PILL.Review;
              return (
                <div key={f.code} className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-2xl grid place-items-center text-white font-bold shrink-0 ${
                      isCritical
                        ? "bg-gradient-to-br from-bad to-pink"
                        : "bg-gradient-to-br from-amber to-pink/70"
                    }`}
                  >
                    {isCritical ? "!" : "⚠"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-bold">{f.code}</span>
                      <span className="text-muted">
                        {" · "}
                        <span className="font-semibold capitalize">
                          {f.severity}
                        </span>{" "}
                        — {f.message}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">
                      Owner &middot; {f.owner}
                    </div>
                  </div>
                  <button
                    className={`text-xs font-semibold px-4 py-1.5 rounded-full shrink-0 ${action.bg} ${action.text}`}
                  >
                    {f.action}
                  </button>
                </div>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h2>Council agenda</h2>
            <button className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-white/60 border border-white/70 text-ink-2 hover:bg-white/85">
              + Add item
            </button>
          </div>
          <div className="space-y-3">
            {data.council_agenda.map((item, i) => {
              const pill = STATUS_PILL[item.status] ?? STATUS_PILL.draft;
              return (
                <div
                  key={i}
                  className={`flex items-start justify-between gap-3 ${
                    i > 0 ? "pt-3 border-t border-[var(--line-2)]" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{item.title}</div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {item.subtitle}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-semibold px-3 py-1 rounded-full shrink-0 ${pill.bg} ${pill.text}`}
                  >
                    {pill.label}
                  </span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  delta,
  deltaTone,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone: "good" | "warn" | "bad";
}) {
  const deltaColors = {
    good: "text-good bg-good/12",
    warn: "text-[#a06200] bg-warn/14",
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
          className={`inline-flex items-center gap-1 mt-2 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${deltaColors[deltaTone]}`}
        >
          {delta}
        </span>
      )}
    </GlassCard>
  );
}

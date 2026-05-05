import { serverApi } from "@/lib/api/server";
import type { ExecutiveOverview } from "@/lib/api/types";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/ui/kpi-card";

export default async function ExecutiveDashboard() {
  const overview = await serverApi<ExecutiveOverview>("/api/executive/overview");

  if (!overview) {
    return (
      <div className="text-center py-20">
        <h2>Unable to load overview</h2>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Executive View
        </p>
        <h1 className="mt-1">University Performance</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Institutional" value={`${overview.overall_percentage}%`} />
        <KpiCard label="Schools" value={String(overview.schools.length)} />
        <KpiCard label="Sessions Held" value={String(overview.total_sessions)} />
        <KpiCard label="Records" value={String(overview.total_records)} />
      </div>

      <h2 className="mb-4">School Standings</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {overview.schools.map((school) => (
          <GlassCard key={school.id}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold">{school.code}</h3>
                <p className="text-xs text-muted mt-0.5">{school.name}</p>
              </div>
              <div className="w-10 h-10 rounded-xl grid place-items-center text-white font-bold text-xs bg-gradient-to-br from-accent to-accent-2">
                {school.code.slice(0, 2)}
              </div>
            </div>
            <div className="mt-3 flex gap-4">
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide">Min %</div>
                <div className="font-bold">{school.min_attendance_pct}%</div>
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide">Type</div>
                <div className="font-bold capitalize">{school.term_type}</div>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

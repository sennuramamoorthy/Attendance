import Link from "next/link";
import { serverApi } from "@/lib/api/server";
import type { ExecutiveOverview } from "@/lib/api/types";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/ui/kpi-card";
import { DownloadCsvButton } from "@/components/admin/download-csv-button";

const REPORTS = [
  {
    title: "At-risk students",
    description:
      "Students below their school's minimum attendance threshold. Filter by school.",
    href: "/reports/at-risk",
    icon: "⚠",
    accent: "from-bad/85 to-pink/85",
  },
  {
    title: "Drill-down explorer",
    description:
      "Navigate from university → school → department → subject → student with attendance %.",
    href: "/reports/drill-down",
    icon: "🔍",
    accent: "from-accent/85 to-accent-2/85",
  },
];

export default async function ReportsLandingPage() {
  const overview = await serverApi<ExecutiveOverview>("/api/executive/overview");

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Reporting & Analytics
        </p>
        <h1 className="mt-1">Reports</h1>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="Institutional"
            value={`${overview.overall_percentage}%`}
          />
          <KpiCard label="Schools" value={String(overview.schools.length)} />
          <KpiCard
            label="Sessions Held"
            value={String(overview.total_sessions)}
          />
          <KpiCard label="Records" value={String(overview.total_records)} />
        </div>
      )}

      <h2 className="mb-3">Run a report</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}>
            <GlassCard className="hover:bg-white/70 transition-colors cursor-pointer h-full">
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${r.accent} grid place-items-center text-white text-xl font-bold shrink-0`}
                >
                  {r.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-base">{r.title}</h3>
                  <p className="text-xs text-muted mt-1.5 leading-snug">
                    {r.description}
                  </p>
                </div>
              </div>
            </GlassCard>
          </Link>
        ))}
      </div>

      <h2 className="mb-3">Exports</h2>
      <GlassCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold">Institutional roll-up (CSV)</h3>
            <p className="text-xs text-muted mt-1">
              All students with their overall attendance %, school, section,
              and a flag for &quot;below threshold&quot;.
            </p>
          </div>
          <DownloadCsvButton
            path="/api/export/students.csv"
            filename="students_attendance.csv"
            label="↓ Download"
          />
        </div>
      </GlassCard>
    </div>
  );
}

import { serverApi } from "@/lib/api/server";
import type { RegistrarOverview } from "@/lib/api/types";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Pill } from "@/components/ui/pill";
import { DownloadCsvButton } from "@/components/admin/download-csv-button";

export default async function RegistrarDashboard() {
  const overview = await serverApi<RegistrarOverview>("/api/registrar/overview");

  if (!overview) {
    return (
      <div className="text-center py-20">
        <h2>Unable to load overview</h2>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
            Registrar
          </p>
          <h1 className="mt-1">Institutional Overview</h1>
        </div>
        <DownloadCsvButton
          path="/api/export/students.csv"
          filename="students_attendance.csv"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Sessions Today" value={String(overview.today_sessions)} />
        <KpiCard label="Present Today" value={String(overview.today_present)} />
        <KpiCard label="Students" value={String(overview.total_students)} />
        <KpiCard label="Faculty" value={String(overview.total_faculty)} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2>Schools at a Glance</h2>
        <div className="flex items-center gap-2">
          <Pill variant="live">{String(overview.active_sessions)} live</Pill>
        </div>
      </div>

      <GlassCard padding="none">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  School
                </th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Code
                </th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Term Type
                </th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Min Attendance
                </th>
              </tr>
            </thead>
            <tbody>
              {overview.schools.map((school) => (
                <tr key={school.id}>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] font-semibold">
                    {school.name}
                  </td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] font-mono text-xs">
                    {school.code}
                  </td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)]">
                    <Pill variant={school.term_type === "semester" ? "upcoming" : "default"}>
                      {school.term_type}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] font-bold">
                    {school.min_attendance_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

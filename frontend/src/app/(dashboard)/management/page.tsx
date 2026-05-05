import { serverApi } from "@/lib/api/server";
import type { Department, RegistrarOverview, School } from "@/lib/api/types";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/ui/kpi-card";

export default async function ManagementDashboard() {
  const [overview, schools, departments] = await Promise.all([
    serverApi<RegistrarOverview>("/api/registrar/overview"),
    serverApi<School[]>("/api/admin/schools"),
    serverApi<Department[]>("/api/admin/departments"),
  ]);

  const allDepts = departments ?? [];
  const allSchools = schools ?? [];
  const schoolName = (id: string) => allSchools.find((s) => s.id === id)?.name ?? "—";

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          HOD / Dean View
        </p>
        <h1 className="mt-1">Department Overview</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <KpiCard label="Departments" value={String(allDepts.length)} />
        <KpiCard label="Faculty" value={String(overview?.total_faculty ?? 0)} />
        <KpiCard label="Sessions Today" value={String(overview?.today_sessions ?? 0)} />
      </div>

      <h2 className="mb-4">Departments</h2>
      <GlassCard padding="none">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Department
                </th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  School
                </th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Code
                </th>
              </tr>
            </thead>
            <tbody>
              {allDepts.map((dept) => (
                <tr key={dept.id}>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] font-semibold">
                    {dept.name}
                  </td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted text-xs">
                    {schoolName(dept.school_id)}
                  </td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] font-mono text-xs">
                    {dept.code}
                  </td>
                </tr>
              ))}
              {allDepts.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted">
                    No departments configured yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

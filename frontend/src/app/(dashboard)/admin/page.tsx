import Link from "next/link";
import { serverApi } from "@/lib/api/server";
import type { ExecutiveOverview, RegistrarOverview } from "@/lib/api/types";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Pill } from "@/components/ui/pill";

const adminModules = [
  {
    title: "Schools",
    description: "Manage schools, term types, and attendance thresholds",
    href: "/admin/schools",
    icon: "🏛",
  },
  {
    title: "Subjects",
    description: "Add subjects and bulk upload via CSV",
    href: "/admin/subjects",
    icon: "📚",
  },
  {
    title: "Students",
    description: "Onboard students individually or bulk upload",
    href: "/admin/students",
    icon: "👥",
  },
  {
    title: "Faculty",
    description: "Manage faculty members and departments",
    href: "/admin/faculty",
    icon: "👨‍🏫",
  },
  {
    title: "Assignments",
    description: "Assign faculty to subjects and sections",
    href: "/admin/assignments",
    icon: "🔗",
  },
  {
    title: "Sections",
    description: "Programs and sections per department",
    href: "/admin/sections",
    icon: "🏫",
  },
  {
    title: "Reports",
    description: "Drill-down explorer (school → student) + at-risk + CSV export",
    href: "/reports",
    icon: "📊",
  },
];

export default async function AdminDashboard() {
  const [overview, registrar] = await Promise.all([
    serverApi<ExecutiveOverview>("/api/executive/overview"),
    serverApi<RegistrarOverview>("/api/registrar/overview"),
  ]);

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Administration
        </p>
        <h1 className="mt-1">University Overview</h1>
      </div>

      {overview && (
        <>
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
            <KpiCard
              label="Records"
              value={String(overview.total_records)}
            />
          </div>

          {registrar && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <KpiCard
                label="Students"
                value={String(registrar.total_students)}
              />
              <KpiCard
                label="Faculty"
                value={String(registrar.total_faculty)}
              />
              <KpiCard
                label="Sessions Today"
                value={String(registrar.today_sessions)}
              />
              <KpiCard
                label="Active Now"
                value={String(registrar.active_sessions)}
                deltaType={registrar.active_sessions > 0 ? "good" : "warn"}
              />
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2>School Standings</h2>
            {registrar && registrar.active_sessions > 0 && (
              <Pill variant="live">{registrar.active_sessions} live</Pill>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
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
                    <div className="text-[10px] text-muted uppercase tracking-wide">
                      Min %
                    </div>
                    <div className="font-bold">{school.min_attendance_pct}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide">
                      Type
                    </div>
                    <div className="font-bold capitalize">{school.term_type}</div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </>
      )}

      <div className="mb-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          System setup
        </p>
        <h2 className="mt-1">Manage configuration</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adminModules.map((mod) => (
          <Link key={mod.href} href={mod.href}>
            <GlassCard className="hover:bg-white/70 transition-colors cursor-pointer h-full">
              <div className="text-3xl mb-3">{mod.icon}</div>
              <h3 className="font-bold text-base">{mod.title}</h3>
              <p className="text-xs text-muted mt-1">{mod.description}</p>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}

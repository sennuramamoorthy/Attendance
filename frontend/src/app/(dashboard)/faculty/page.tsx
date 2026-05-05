import Link from "next/link";
import { serverApi } from "@/lib/api/server";
import type { FacultyScheduleItem } from "@/lib/api/types";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { KpiCard } from "@/components/ui/kpi-card";
import { StartSessionButton } from "@/components/attendance/start-session-button";

export default async function FacultyDashboard() {
  const schedule = await serverApi<FacultyScheduleItem[]>("/api/faculty/schedule");
  const stats = await serverApi<{ today_students: number }>("/api/faculty/stats");

  const items = schedule ?? [];

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Faculty
        </p>
        <h1 className="mt-1">My Classes</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard label="Today" value={String(items.length)} delta="classes" />
        <KpiCard label="Students" value={String(stats?.today_students ?? 0)} />
        <KpiCard label="Avg" value="--" />
      </div>

      <h2 className="mb-4">Schedule</h2>
      <div className="space-y-3">
        {items.map((cls) => {
          const isActive = cls.session_status === "active";
          const isDone = cls.session_status === "closed";

          return (
            <GlassCard key={cls.schedule_id} padding="sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm font-bold font-mono text-accent">
                    {cls.start_time?.slice(0, 5)}
                  </div>
                  <div>
                    <div className="font-semibold">
                      {cls.subject_code} &middot; {cls.subject_name}
                    </div>
                    <div className="text-xs text-muted">
                      {cls.room} &middot; Year {cls.section_year} {cls.section_division}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/faculty/attendance/${cls.assignment_id}`}
                    className="text-xs text-muted hover:text-accent font-semibold"
                  >
                    History →
                  </Link>
                  {isActive ? (
                    <Pill variant="live">Live</Pill>
                  ) : isDone ? (
                    <Pill variant="done">Done</Pill>
                  ) : (
                    <StartSessionButton
                      assignmentId={cls.assignment_id}
                      scheduleId={cls.schedule_id}
                    />
                  )}
                </div>
              </div>
            </GlassCard>
          );
        })}

        {items.length === 0 && (
          <GlassCard className="text-center py-8">
            <p className="text-muted">No classes scheduled for today</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

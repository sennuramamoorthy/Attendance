import Link from "next/link";
import { serverApi } from "@/lib/api/server";
import type { StudentScheduleItem, StudentSummary } from "@/lib/api/types";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";

export default async function StudentDashboard() {
  const summary = await serverApi<StudentSummary>("/api/student/me");
  const schedule = await serverApi<StudentScheduleItem[]>("/api/student/schedule");

  if (!summary || !summary.enrollment_no) {
    return (
      <div className="text-center py-20">
        <h2>Student profile not found</h2>
        <p className="text-muted mt-2">Contact admin to set up your student account.</p>
      </div>
    );
  }

  const items = schedule ?? [];

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          {summary.enrollment_no}
        </p>
        <h1 className="mt-1">Hey {summary.full_name?.split(" ")[0] ?? "there"} 👋</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <GlassCard className="bg-gradient-to-br from-accent/85 to-accent-2/85 text-white border-0 col-span-1 md:col-span-2">
          <div className="flex justify-between items-center gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] opacity-85 font-semibold">
                This term
              </div>
              <div className="text-[42px] font-extrabold mt-1 leading-none">
                {summary.overall_percentage.toFixed(1)}%
              </div>
              <div className="opacity-85 text-[11px] mt-1">
                {summary.present_classes} of {summary.total_classes} classes attended
              </div>
            </div>
            <ProgressRing percentage={summary.overall_percentage} size={90} label="term" />
          </div>
        </GlassCard>

        <GlassCard>
          <div className="text-center">
            <div className="text-xs text-muted uppercase tracking-wide font-semibold">Today</div>
            <div className="text-3xl font-extrabold mt-2">{items.length}</div>
            <div className="text-xs text-muted mt-1">classes</div>
          </div>
        </GlassCard>
      </div>

      <h2 className="mb-4">Today &middot; {items.length} classes</h2>

      <div className="space-y-3">
        {items.map((cls) => {
          const isLive = cls.session_status === "active";
          const isMarked = cls.is_marked;

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
                      {cls.room} &middot; {cls.faculty_name ?? ""}
                    </div>
                  </div>
                </div>
                <div>
                  {isMarked ? (
                    <Pill variant="done">Marked</Pill>
                  ) : isLive ? (
                    <Link href="/student/scan">
                      <Button variant="primary" className="text-xs px-3 py-1.5">
                        Scan
                      </Button>
                    </Link>
                  ) : (
                    <Pill variant="upcoming">Upcoming</Pill>
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

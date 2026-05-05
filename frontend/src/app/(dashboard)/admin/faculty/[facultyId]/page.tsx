import Link from "next/link";
import { serverApi } from "@/lib/api/server";
import type { AdminFacultyDetail } from "@/lib/api/types";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Pill } from "@/components/ui/pill";
import { Avatar } from "@/components/ui/avatar";

export default async function AdminFacultyDetailPage({
  params,
}: {
  params: Promise<{ facultyId: string }>;
}) {
  const { facultyId } = await params;
  const data = await serverApi<AdminFacultyDetail>(
    `/api/admin/faculty/${facultyId}/detail`
  );

  if (!data) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          <Link href="/admin/faculty" className="hover:text-accent">
            Faculty
          </Link>{" "}
          ▸
        </p>
        <h1 className="mt-1">Faculty not found</h1>
        <p className="text-muted text-sm mt-2">
          This faculty member doesn&apos;t exist or you don&apos;t have permission to view them.
        </p>
      </div>
    );
  }

  const { faculty, department, school, summary, assignments, today_schedule } = data;

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          <Link href="/admin/faculty" className="hover:text-accent">
            Faculty
          </Link>{" "}
          ▸ {faculty.employee_id}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <Avatar name={faculty.full_name} size="lg" variant="blue" />
          <div>
            <h1>{faculty.full_name}</h1>
            <p className="text-xs font-mono text-muted mt-0.5">
              {faculty.employee_id} · {faculty.email}
              {faculty.phone ? ` · ${faculty.phone}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <KpiCard
          label="Assignments"
          value={String(summary.assignments_count)}
        />
        <KpiCard
          label="Sessions Held"
          value={String(summary.sessions_held)}
        />
        <KpiCard
          label="Avg Attendance"
          value={
            summary.avg_attendance_pct != null
              ? `${summary.avg_attendance_pct}%`
              : "—"
          }
          delta={
            summary.avg_attendance_pct != null
              ? `vs school min ${school.min_attendance_pct}%`
              : undefined
          }
          deltaType={
            summary.avg_attendance_pct != null &&
            summary.avg_attendance_pct < school.min_attendance_pct
              ? "bad"
              : "good"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <GlassCard className="lg:col-span-2">
          <h2 className="mb-3">Org context</h2>
          <dl className="space-y-2 text-sm">
            <Row label="School" value={`${school.code} · ${school.name}`} />
            <Row label="Department" value={department.name} />
            <Row label="Min required attendance" value={`${school.min_attendance_pct}%`} />
          </dl>
        </GlassCard>
        <GlassCard>
          <h2 className="mb-2">Today</h2>
          <div className="text-3xl font-extrabold">
            {today_schedule.length}
          </div>
          <p className="text-xs text-muted mt-1">classes scheduled</p>
        </GlassCard>
      </div>

      {/* Assignments table */}
      <h2 className="mb-3">Assignments</h2>
      <GlassCard padding="none" className="mb-8">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Subject
                </th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Section
                </th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Type
                </th>
                <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Sessions
                </th>
                <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Avg %
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const isLow =
                  a.average_attendance_pct != null &&
                  a.average_attendance_pct < school.min_attendance_pct;
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">
                      <div className="font-mono text-xs text-muted">
                        {a.subject_code}
                      </div>
                      <div className="font-semibold">{a.subject_name}</div>
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted">
                      {a.section_label}
                      <div className="text-[10px] mt-0.5">
                        {a.section_size} students
                      </div>
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] capitalize">
                      {a.subject_type}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-right text-xs font-mono">
                      {a.sessions_held}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-right">
                      <span
                        className={`font-bold ${
                          a.average_attendance_pct == null
                            ? "text-muted"
                            : isLow
                              ? "text-bad"
                              : "text-good"
                        }`}
                      >
                        {a.average_attendance_pct != null
                          ? `${a.average_attendance_pct}%`
                          : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] w-32">
                      <div className="w-full h-1.5 bg-white/50 rounded-full overflow-hidden border border-white/70">
                        <div
                          className={`h-full rounded-full ${
                            isLow
                              ? "bg-gradient-to-r from-bad to-pink"
                              : "bg-gradient-to-r from-accent to-accent-2"
                          }`}
                          style={{
                            width: `${a.average_attendance_pct ?? 0}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No assignments yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <h2 className="mb-3">Today&apos;s schedule</h2>
      {today_schedule.length === 0 ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">No classes scheduled for today</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {today_schedule.map((cls) => {
            const isLive = cls.session_status === "active";
            const isDone = cls.session_status === "closed";
            return (
              <GlassCard key={cls.schedule_id} padding="sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-bold font-mono text-accent">
                      {cls.start_time.slice(0, 5)}
                    </div>
                    <div>
                      <div className="font-semibold">
                        {cls.subject_code} &middot; {cls.subject_name}
                      </div>
                      <div className="text-xs text-muted">
                        {cls.room} &middot; {cls.section_label}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isLive && (
                      <span className="text-xs text-muted font-mono">
                        {cls.present_count} present
                      </span>
                    )}
                    {isLive ? (
                      <Pill variant="live">Live</Pill>
                    ) : isDone ? (
                      <Pill variant="done">{cls.present_count} attended</Pill>
                    ) : (
                      <Pill variant="upcoming">Upcoming</Pill>
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted uppercase tracking-wide text-[10px] font-semibold">
        {label}
      </dt>
      <dd className="font-semibold text-ink-2 text-right">{value}</dd>
    </div>
  );
}

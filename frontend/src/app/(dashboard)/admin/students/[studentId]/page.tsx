import Link from "next/link";
import { serverApi } from "@/lib/api/server";
import type { AdminStudentDetail } from "@/lib/api/types";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Pill } from "@/components/ui/pill";
import { Avatar } from "@/components/ui/avatar";

export default async function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const data = await serverApi<AdminStudentDetail>(
    `/api/admin/students/${studentId}/detail`
  );

  if (!data) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          <Link href="/admin/students" className="hover:text-accent">
            Students
          </Link>{" "}
          ▸
        </p>
        <h1 className="mt-1">Student not found</h1>
        <p className="text-muted text-sm mt-2">
          This student doesn&apos;t exist or you don&apos;t have permission to view them.
        </p>
      </div>
    );
  }

  const { student, section, program, department, school, attendance, per_subject, today_schedule } =
    data;

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          <Link href="/admin/students" className="hover:text-accent">
            Students
          </Link>{" "}
          ▸ {student.enrollment_no}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <Avatar name={student.full_name} size="lg" />
          <div>
            <h1>{student.full_name}</h1>
            <p className="text-xs font-mono text-muted mt-0.5">
              {student.enrollment_no} · {student.email}
              {student.phone ? ` · ${student.phone}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Top: attendance ring + org context */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <GlassCard
          className={`md:col-span-2 ${
            attendance.below_threshold
              ? "bg-gradient-to-br from-bad/85 to-pink/85 text-white border-0"
              : "bg-gradient-to-br from-accent/85 to-accent-2/85 text-white border-0"
          }`}
        >
          <div className="flex justify-between items-center gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] opacity-85 font-semibold">
                Overall attendance
              </div>
              <div className="text-[42px] font-extrabold mt-1 leading-none">
                {attendance.overall_percentage.toFixed(1)}%
              </div>
              <div className="opacity-85 text-[11px] mt-1">
                {attendance.present} of {attendance.total} classes attended
                {attendance.below_threshold &&
                  ` · below school minimum (${school.min_attendance_pct}%)`}
              </div>
              <div className="flex gap-2 mt-3">
                {attendance.late > 0 && (
                  <span className="text-[10px] bg-white/18 px-2 py-0.5 rounded-full font-semibold">
                    Late: {attendance.late}
                  </span>
                )}
                {attendance.absent > 0 && (
                  <span className="text-[10px] bg-white/18 px-2 py-0.5 rounded-full font-semibold">
                    Absent: {attendance.absent}
                  </span>
                )}
                {attendance.excused > 0 && (
                  <span className="text-[10px] bg-white/18 px-2 py-0.5 rounded-full font-semibold">
                    Excused: {attendance.excused}
                  </span>
                )}
              </div>
            </div>
            <ProgressRing
              percentage={attendance.overall_percentage}
              size={110}
              label={attendance.below_threshold ? "at-risk" : "on track"}
            />
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="font-bold mb-3">Org context</h3>
          <dl className="space-y-2 text-xs">
            <Row label="School" value={`${school.code} · ${school.name}`} />
            <Row label="Department" value={department.name} />
            <Row label="Program" value={`${program.code} · ${program.name}`} />
            <Row
              label="Section"
              value={`Year ${section.year} ${section.division}`}
            />
            <Row label="Admitted" value={String(student.admitted_year)} />
            <Row
              label="Device"
              value={student.device_bound ? "bound" : "not registered"}
            />
            <Row
              label="Min required"
              value={`${school.min_attendance_pct}%`}
            />
          </dl>
        </GlassCard>
      </div>

      {/* Per-subject breakdown */}
      <h2 className="mb-3">Attendance by subject</h2>
      <GlassCard padding="none" className="mb-8">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Subject
                </th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Faculty
                </th>
                <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Sessions
                </th>
                <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  %
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {per_subject.map((s) => {
                const pct = s.percentage ?? 0;
                const isLow = s.percentage != null && s.percentage < school.min_attendance_pct;
                return (
                  <tr key={s.subject_code}>
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">
                      <div className="font-mono text-xs text-muted">
                        {s.subject_code}
                      </div>
                      <div className="font-semibold">{s.subject_name}</div>
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted">
                      {s.faculty_name}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-right text-xs font-mono">
                      {s.present} / {s.total}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-right">
                      <span
                        className={`font-bold ${isLow ? "text-bad" : "text-good"}`}
                      >
                        {s.percentage != null ? `${s.percentage.toFixed(1)}%` : "—"}
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
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {per_subject.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    No attendance recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Today's schedule */}
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
                        {cls.room} &middot; {cls.faculty_name}
                      </div>
                    </div>
                  </div>
                  <div>
                    {cls.is_marked ? (
                      <Pill variant="done">Marked</Pill>
                    ) : isLive ? (
                      <Pill variant="live">Live</Pill>
                    ) : isDone ? (
                      <Pill variant="default">Missed</Pill>
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
      <dd className="font-semibold text-ink-2 text-right truncate max-w-[60%]">
        {value}
      </dd>
    </div>
  );
}

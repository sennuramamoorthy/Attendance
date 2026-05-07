"use client";

/**
 * Class-in-Charge dashboard.
 *
 * Top: class view — header + timetable grid + subjects table (same data as
 *      the admin section detail page; the backend just reuses the helper).
 * Bottom: students list with tabs for Today / Week / Month / Term. Each tab
 *      shows per-student counts + %; the Today tab additionally surfaces
 *      a "Mark Present" override button on rows that aren't already
 *      present, calling the existing manual-mark endpoint.
 *
 * The CIC's section is derived server-side from their UserRole row, so the
 * page just calls /api/cic/overview and /api/cic/students — no section_id
 * juggling on the client.
 */

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Pill } from "@/components/ui/pill";
import { Avatar } from "@/components/ui/avatar";
import { cicApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { StudentSessionsModal } from "@/components/cic/student-sessions-modal";
import type {
  AdminSectionDetail,
  AdminSchoolPeriod,
  AdminSectionScheduleClass,
  AdminSectionScheduleDay,
  AttendanceWindow,
  CicStudentRow,
  CicStudentsResponse,
} from "@/lib/api/types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WINDOW_LABELS: Record<AttendanceWindow, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  term: "Term",
};

export default function CicDashboard() {
  const [overview, setOverview] = useState<AdminSectionDetail | null>(null);
  const [students, setStudents] = useState<CicStudentsResponse | null>(null);
  const [window, setWindow] = useState<AttendanceWindow>("today");
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<CicStudentRow | null>(null);

  // Class info loads once; doesn't change as user switches the window tab.
  useEffect(() => {
    cicApi
      .getOverview()
      .then(setOverview)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load class info"
        )
      )
      .finally(() => setLoadingOverview(false));
  }, []);

  const fetchStudents = useCallback((w: AttendanceWindow) => {
    // Don't flip loading=true synchronously here — it triggers React 19's
    // set-state-in-effect lint when called from useEffect. The table just
    // shows the previous window's rows for the ~100ms between tab clicks
    // and the new response, which is fine.
    cicApi
      .getStudents(w)
      .then(setStudents)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load students"
        )
      )
      .finally(() => setLoadingStudents(false));
  }, []);

  useEffect(() => {
    fetchStudents(window);
  }, [window, fetchStudents]);

  if (loadingOverview) {
    return (
      <div>
        <h1 className="mb-6">Class</h1>
        <GlassCard className="text-center py-8">
          <p className="text-muted">Loading class info...</p>
        </GlassCard>
      </div>
    );
  }

  if (!overview) {
    return (
      <div>
        <h1 className="mb-2">Class</h1>
        <GlassCard className="text-center py-8">
          <p className="text-bad">{error || "Class not found"}</p>
          <p className="text-muted text-xs mt-2">
            Your CIC role must be scoped to a section. Ask an administrator
            to assign one.
          </p>
        </GlassCard>
      </div>
    );
  }

  const { section, program, department, school, periods, schedule, assignments, summary, student_count } =
    overview;

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Class-in-Charge
        </p>
        <h1 className="mt-1">
          {program.code} · Year {section.year} {section.division}
        </h1>
        <p className="text-xs text-muted mt-1">
          {school.code} · {school.name} · {department.name}
          {section.room && (
            <>
              {" · "}
              <strong>Classroom: {section.room}</strong>
            </>
          )}
        </p>
      </div>

      {error && (
        <GlassCard className="mb-4 border-l-4 border-l-bad">
          <p className="text-bad text-sm">{error}</p>
        </GlassCard>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <KpiCard label="Students" value={String(student_count)} />
        <KpiCard label="Subjects" value={String(summary.subject_count)} />
        <KpiCard label="Labs" value={String(summary.lab_count)} />
        <KpiCard
          label="Weekly classes"
          value={String(summary.weekly_class_count)}
        />
        <KpiCard
          label="Sessions held"
          value={String(summary.total_sessions_held)}
        />
      </div>

      {/* Weekly timetable grid */}
      <div className="flex items-center justify-between mb-3">
        <h2>Timetable</h2>
        {section.room && (
          <p className="text-xs text-muted">
            Default classroom: <strong>{section.room}</strong>
          </p>
        )}
      </div>
      {periods.length === 0 || summary.weekly_class_count === 0 ? (
        <GlassCard className="text-center py-8 mb-8">
          <p className="text-muted">No timetable scheduled for this class.</p>
        </GlassCard>
      ) : (
        <PeriodGrid
          periods={periods}
          schedule={schedule.slice(0, Math.max(5, lastNonEmptyDay(schedule) + 1))}
        />
      )}

      {/* Subjects + faculty */}
      <h2 className="mb-3 mt-8">Subjects &amp; Faculty</h2>
      {assignments.length === 0 ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">No subjects assigned to this class yet.</p>
        </GlassCard>
      ) : (
        <GlassCard padding="none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Subject
                  </th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Faculty
                  </th>
                  <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Sessions
                  </th>
                  <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Avg %
                  </th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const isLow =
                    a.attendance_pct !== null &&
                    a.attendance_pct < school.min_attendance_pct;
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-3 border-t border-[var(--line-2)]">
                        <div className="font-mono text-xs text-muted">
                          {a.subject_code}
                        </div>
                        <div className="font-semibold">{a.subject_name}</div>
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)]">
                        {a.subject_type === "lab" ? (
                          <Pill variant="warn">Lab</Pill>
                        ) : (
                          <Pill variant="default">Theory</Pill>
                        )}
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)]">
                        <div className="font-semibold">
                          {a.faculty.full_name}
                        </div>
                        <div className="text-[11px] text-muted font-mono">
                          {a.faculty.employee_id}
                        </div>
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)] text-right font-mono text-xs">
                        {a.sessions_held}
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)] text-right">
                        {a.attendance_pct === null ? (
                          <span className="text-muted text-xs">—</span>
                        ) : (
                          <span
                            className={`font-bold ${isLow ? "text-bad" : "text-good"}`}
                          >
                            {a.attendance_pct.toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Students with windowed attendance */}
      <h2 className="mt-8 mb-3">Students</h2>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2">
          {(["today", "week", "month", "term"] as AttendanceWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                window === w
                  ? "bg-white text-ink shadow-[0_4px_14px_rgba(28,32,82,0.08)]"
                  : "bg-white/55 border-white/70 text-muted hover:bg-white/70"
              }`}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
        {students && (
          <p className="text-xs text-muted font-mono">
            {students.window_start} → {students.window_end} · {students.sessions_held}{" "}
            session{students.sessions_held === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {loadingStudents ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">Loading students...</p>
        </GlassCard>
      ) : students && students.students.length > 0 ? (
        <StudentsTable
          students={students.students}
          window={window}
          minAttendancePct={school.min_attendance_pct}
          onEdit={(row) => setEditing(row)}
        />
      ) : (
        <GlassCard className="text-center py-8">
          <p className="text-muted">No students in this class.</p>
        </GlassCard>
      )}

      {editing && (
        <StudentSessionsModal
          studentId={editing.id}
          studentName={editing.name}
          window={window}
          onClose={() => setEditing(null)}
          onSaved={() => fetchStudents(window)}
        />
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────

function lastNonEmptyDay(schedule: AdminSectionScheduleDay[]): number {
  return schedule.reduce(
    (acc, day, i) => (day.classes.length > 0 ? i : acc),
    -1
  );
}

function PeriodGrid({
  periods,
  schedule,
}: {
  periods: AdminSchoolPeriod[];
  schedule: AdminSectionScheduleDay[];
}) {
  // Same matrix logic as the admin section detail. Builds a (day,period)
  // map and a set of cells eclipsed by row-spanning labs above them.
  const cellMap = new Map<string, AdminSectionScheduleClass>();
  const eclipsed = new Set<string>();
  for (const day of schedule) {
    for (const cls of day.classes) {
      if (cls.period_number == null) continue;
      cellMap.set(`${day.day_of_week}:${cls.period_number}`, cls);
      for (let i = 1; i < cls.duration_periods; i++) {
        eclipsed.add(`${day.day_of_week}:${cls.period_number + i}`);
      }
    }
  }

  return (
    <GlassCard padding="none" className="mb-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted bg-white/40 border-b border-[var(--line-2)]">
                Period
              </th>
              {schedule.map((day) => (
                <th
                  key={day.day_of_week}
                  className="px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted bg-white/40 border-b border-[var(--line-2)]"
                >
                  {DAY_NAMES[day.day_of_week]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => {
              if (period.is_break) {
                return (
                  <tr key={period.period_number}>
                    <td className="px-3 py-2 border-t border-[var(--line-2)] text-[11px] font-semibold text-muted">
                      <div>{period.label ?? "Break"}</div>
                      <div className="font-mono text-[10px] mt-0.5">
                        {period.start_time}–{period.end_time}
                      </div>
                    </td>
                    <td
                      colSpan={schedule.length}
                      className="border-t border-[var(--line-2)] py-2 px-3 text-center text-[11px] uppercase tracking-[0.16em] font-semibold text-muted bg-amber/10"
                    >
                      ⏸ {period.label ?? "Break"}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={period.period_number}>
                  <td className="px-3 py-2 border-t border-[var(--line-2)] align-top">
                    <div className="text-[11px] font-bold">
                      P{period.period_number}
                    </div>
                    <div className="text-[10px] font-mono text-muted mt-0.5">
                      {period.start_time}–{period.end_time}
                    </div>
                  </td>
                  {schedule.map((day) => {
                    const key = `${day.day_of_week}:${period.period_number}`;
                    if (eclipsed.has(key)) return null;
                    const cls = cellMap.get(key);
                    if (!cls) {
                      return (
                        <td
                          key={key}
                          className="border-t border-[var(--line-2)] px-2 py-2 text-center text-muted text-[10.5px]"
                        >
                          —
                        </td>
                      );
                    }
                    const isLab = cls.subject_type === "lab";
                    const tint = isLab
                      ? "bg-amber/15 border-amber/50"
                      : "bg-accent/10 border-accent/30";
                    return (
                      <td
                        key={key}
                        rowSpan={cls.duration_periods}
                        className="border-t border-[var(--line-2)] p-1.5 align-top"
                      >
                        <div
                          className={`rounded-lg border ${tint} px-2 py-1.5 h-full`}
                          title={`${cls.subject_code} ${cls.subject_name} · ${cls.faculty_name} · ${cls.room}`}
                        >
                          <div className="text-[11px] font-bold font-mono">
                            {cls.subject_code}
                          </div>
                          <div className="text-[10.5px] font-semibold leading-snug truncate">
                            {cls.subject_name}
                          </div>
                          <div className="text-[10px] text-muted truncate mt-0.5">
                            {cls.faculty_name}
                          </div>
                          {!cls.uses_section_room && (
                            <div className="inline-block mt-1 text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-amber/30 text-ink-2">
                              🛠 {cls.room}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function StudentsTable({
  students,
  window,
  minAttendancePct,
  onEdit,
}: {
  students: CicStudentRow[];
  window: AttendanceWindow;
  minAttendancePct: number;
  onEdit: (row: CicStudentRow) => void;
}) {
  return (
    <GlassCard padding="none">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                Student
              </th>
              <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                Enrollment
              </th>
              {window === "today" ? (
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Status
                </th>
              ) : (
                <>
                  <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Present
                  </th>
                  <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Late
                  </th>
                  <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Absent
                  </th>
                </>
              )}
              <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                Total
              </th>
              <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                %
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const pct = s.percentage;
              const isLow = pct !== null && pct < minAttendancePct;
              return (
                <tr key={s.id}>
                  <td className="px-4 py-3 border-t border-[var(--line-2)]">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} size="sm" />
                      <span className="font-semibold">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] font-mono text-xs text-muted">
                    {s.enrollment_no}
                  </td>
                  {window === "today" ? (
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">
                      <TodayStatusPill status={s.today_status} />
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 border-t border-[var(--line-2)] text-right font-mono text-xs">
                        {s.present}
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)] text-right font-mono text-xs">
                        {s.late}
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)] text-right font-mono text-xs text-bad">
                        {s.absent}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 border-t border-[var(--line-2)] text-right font-mono text-xs">
                    {s.total}
                  </td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] text-right">
                    {pct === null ? (
                      <span className="text-muted text-xs">—</span>
                    ) : (
                      <span className={`font-bold ${isLow ? "text-bad" : "text-good"}`}>
                        {pct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] text-right whitespace-nowrap">
                    <button
                      onClick={() => onEdit(s)}
                      className="text-[10.5px] px-2.5 py-1 rounded-full border border-accent/40 text-accent font-semibold hover:bg-accent/10 cursor-pointer"
                    >
                      ✎ Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function TodayStatusPill({ status }: { status: string | null }) {
  if (status === "present") return <Pill variant="done">Present</Pill>;
  if (status === "late") return <Pill variant="warn">Late</Pill>;
  if (status === "absent") return <Pill variant="default">Absent</Pill>;
  if (status === "excused") return <Pill variant="upcoming">Excused</Pill>;
  return <Pill variant="default">— No record</Pill>;
}

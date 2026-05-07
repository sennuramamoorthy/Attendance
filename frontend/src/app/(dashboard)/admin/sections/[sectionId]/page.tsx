/**
 * Admin · Section detail.
 *
 * Models the way Indian universities run timetables: students stay in a fixed
 * classroom; faculty rotate through. The school owns a master period grid
 * (back-to-back periods, possibly interrupted by a Lunch break) shared by
 * every section in the school. The schedule is rendered as a period × day
 * matrix anchored on that grid.
 *
 * Layout:
 *   1. Breadcrumb + title (program · year/division)
 *   2. KPI strip — students, subjects, labs, weekly classes, avg attendance
 *   3. Section card (with classroom) + CIC card
 *   4. Master timetable: rows = periods, cols = Mon–Fri. Cells show subject
 *      code, faculty name, and a room label only when it differs from the
 *      section's classroom (i.e. labs).
 *   5. Subjects + Labs table with faculty, credits, sessions held, attendance
 */

import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Pill } from "@/components/ui/pill";
import { serverApi } from "@/lib/api/server";
import type {
  AdminSchoolPeriod,
  AdminSectionDetail,
  AdminSectionScheduleClass,
  AdminSectionScheduleDay,
} from "@/lib/api/types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function AdminSectionDetailPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  const data = await serverApi<AdminSectionDetail>(
    `/api/admin/sections/${sectionId}/detail`
  );

  if (!data) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          <Link href="/admin/sections" className="hover:text-accent">
            Sections
          </Link>{" "}
          ▸
        </p>
        <h1 className="mt-1">Section not found</h1>
        <p className="text-muted text-sm mt-2">
          This section doesn&apos;t exist or you don&apos;t have permission to view it.
        </p>
      </div>
    );
  }

  const {
    section,
    program,
    department,
    school,
    cic,
    student_count,
    summary,
    periods,
    assignments,
    schedule,
  } = data;

  // Decide which days to show. Default: Mon–Fri. Extend to Sat/Sun only when
  // the timetable actually has classes there (some schools do Sat morning).
  const lastNonEmpty = schedule.reduce(
    (acc, day, i) => (day.classes.length > 0 ? i : acc),
    -1
  );
  const visibleDayCount = Math.max(5, lastNonEmpty + 1);
  const visibleDays = schedule.slice(0, visibleDayCount);

  const sectionLabel = `${program.code} · Year ${section.year} ${section.division}`;
  const avgPct = summary.avg_attendance_pct;
  const avgIsLow = avgPct !== null && avgPct < school.min_attendance_pct;

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          <Link href="/admin/sections" className="hover:text-accent">
            Sections
          </Link>{" "}
          ▸ {program.code} ▸ Y{section.year}
          {section.division}
        </p>
        <h1 className="mt-1">{sectionLabel}</h1>
        <p className="text-xs text-muted mt-1">
          {school.code} · {school.name} · {department.name} · {program.name}
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <KpiCard label="Students" value={String(student_count)} />
        <KpiCard label="Subjects" value={String(summary.subject_count)} />
        <KpiCard label="Labs" value={String(summary.lab_count)} />
        <KpiCard
          label="Weekly classes"
          value={String(summary.weekly_class_count)}
        />
        <KpiCard
          label="Avg attendance"
          value={avgPct !== null ? `${avgPct.toFixed(1)}%` : "—"}
          deltaType={avgPct === null ? undefined : avgIsLow ? "warn" : "good"}
        />
      </div>

      {/* Section + CIC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <GlassCard>
          <h3 className="font-bold mb-3">Section</h3>
          <dl className="space-y-2 text-xs">
            <Row label="School" value={`${school.code} · ${school.name}`} />
            <Row label="Department" value={department.name} />
            <Row label="Program" value={`${program.code} · ${program.name}`} />
            <Row label="Year / Division" value={`Year ${section.year} · ${section.division}`} />
            <Row
              label="Classroom"
              value={
                section.room
                  ? `${section.room} (students stay; faculty rotate)`
                  : "Not set"
              }
            />
            <Row
              label="Sessions held"
              value={String(summary.total_sessions_held)}
            />
            <Row
              label="Min attendance"
              value={`${school.min_attendance_pct}%`}
            />
          </dl>
        </GlassCard>

        <GlassCard>
          <h3 className="font-bold mb-3">Class-in-Charge</h3>
          {cic ? (
            <div>
              <div className="font-semibold">{cic.full_name}</div>
              <div className="text-xs text-muted font-mono mt-0.5">
                {cic.email}
              </div>
              <p className="text-[11px] text-muted mt-3">
                The CIC owns the daily roster, can override marks manually, and
                receives at-risk alerts for this section.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted">No Class-in-Charge assigned.</p>
              <p className="text-[11px] text-muted mt-2">
                Assign one from{" "}
                <Link href="/admin/users" className="text-accent hover:underline">
                  Users &amp; Onboarding
                </Link>{" "}
                — create a user with role <strong>CIC</strong> and pick this
                section.
              </p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Period × day timetable grid */}
      <div className="flex items-center justify-between mb-3">
        <h2>Weekly timetable</h2>
        {section.room && (
          <p className="text-xs text-muted">
            Default classroom: <strong>{section.room}</strong> · faculty rotate
            here for every theory class
          </p>
        )}
      </div>

      {periods.length === 0 ? (
        <GlassCard className="text-center py-8 mb-8">
          <p className="text-muted">
            This school doesn&apos;t have a period grid yet — once one is set
            up the timetable will render here.
          </p>
        </GlassCard>
      ) : summary.weekly_class_count === 0 ? (
        <GlassCard className="text-center py-8 mb-8">
          <p className="text-muted">
            Period grid is set, but no classes are scheduled in this section
            yet.
          </p>
        </GlassCard>
      ) : (
        <PeriodGrid
          periods={periods}
          schedule={visibleDays}
          sectionRoom={section.room}
          minAttendancePct={school.min_attendance_pct}
        />
      )}

      {/* Subjects + labs */}
      <h2 className="mb-3 mt-8">Subjects &amp; Labs</h2>
      {assignments.length === 0 ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">No subjects assigned yet.</p>
          <p className="text-[11px] text-muted mt-2">
            Add assignments from{" "}
            <Link href="/admin/assignments" className="text-accent hover:underline">
              Assignments
            </Link>
            .
          </p>
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
                    Credits
                  </th>
                  <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Sessions
                  </th>
                  <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Attendance
                  </th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const pct = a.attendance_pct;
                  const isLow = pct !== null && pct < school.min_attendance_pct;
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-3 border-t border-[var(--line-2)]">
                        <div className="font-mono text-xs text-muted">
                          {a.subject_code}
                        </div>
                        <div className="font-semibold">{a.subject_name}</div>
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)]">
                        <SubjectTypePill type={a.subject_type} />
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)]">
                        <Link
                          href={`/admin/faculty/${a.faculty.id}`}
                          className="hover:text-accent"
                        >
                          <div className="font-semibold">
                            {a.faculty.full_name}
                          </div>
                          <div className="text-[11px] text-muted font-mono">
                            {a.faculty.employee_id}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)] text-right font-mono text-xs">
                        {a.credits}
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)] text-right font-mono text-xs">
                        {a.sessions_held}
                      </td>
                      <td className="px-4 py-3 border-t border-[var(--line-2)] text-right">
                        {pct === null ? (
                          <span className="text-muted text-xs">—</span>
                        ) : (
                          <span
                            className={`font-bold ${isLow ? "text-bad" : "text-good"}`}
                          >
                            {pct.toFixed(1)}%
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
    </div>
  );
}

/**
 * Period × day timetable grid.
 *
 * Builds a sparse map keyed by (day, period) so each schedule row drops into
 * the right cell. A multi-period block (e.g. a 2-period lab) is rendered as
 * a single cell with `gridRowSpan` so it visually covers the periods it
 * occupies — students reading the grid see "Lab in E-Lab1" once, not twice.
 *
 * Cells that are eclipsed by a row-spanning block above them are tracked in
 * `eclipsed` so we don't render an empty placeholder over the spanning cell.
 */
function PeriodGrid({
  periods,
  schedule,
  sectionRoom,
  minAttendancePct,
}: {
  periods: AdminSchoolPeriod[];
  schedule: AdminSectionScheduleDay[];
  sectionRoom: string | null;
  minAttendancePct: number;
}) {
  // Fast lookup: cellMap[`${day}:${period_number}`] → class
  const cellMap = new Map<string, AdminSectionScheduleClass>();
  // Cells covered by a previous row-spanning block (key: `${day}:${period}`)
  const eclipsed = new Set<string>();

  for (const day of schedule) {
    for (const cls of day.classes) {
      if (cls.period_number == null) continue;
      cellMap.set(`${day.day_of_week}:${cls.period_number}`, cls);
      // Mark subsequent periods as eclipsed when the block spans >1 period.
      for (let i = 1; i < cls.duration_periods; i++) {
        eclipsed.add(`${day.day_of_week}:${cls.period_number + i}`);
      }
    }
  }

  void minAttendancePct;
  void sectionRoom;

  return (
    <GlassCard padding="none">
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
                    if (eclipsed.has(key)) {
                      // Covered by a row-spanning block above — render nothing.
                      return null;
                    }
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
                    return (
                      <td
                        key={key}
                        rowSpan={cls.duration_periods}
                        className="border-t border-[var(--line-2)] p-1.5 align-top"
                      >
                        <ClassCell cls={cls} />
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

function ClassCell({ cls }: { cls: AdminSectionScheduleClass }) {
  // Distinct background per type so labs jump out from theory.
  const isLab = cls.subject_type === "lab";
  const tint = isLab
    ? "bg-amber/15 border-amber/50"
    : "bg-accent/10 border-accent/30";

  return (
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
      {/* Show room only when the class is NOT in the section's default room
          (i.e. labs). Otherwise the room is implied — the student is sitting
          there. Reduces visual noise. */}
      {!cls.uses_section_room && (
        <div className="inline-block mt-1 text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-amber/30 text-ink-2">
          🛠 {cls.room}
        </div>
      )}
    </div>
  );
}

function SubjectTypePill({
  type,
}: {
  type: "theory" | "lab" | "tutorial";
}) {
  if (type === "lab") return <Pill variant="warn">Lab</Pill>;
  if (type === "tutorial") return <Pill variant="upcoming">Tutorial</Pill>;
  return <Pill variant="default">Theory</Pill>;
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

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { adminApi, atRiskApi } from "@/lib/api";
import type { AtRiskStudent, School } from "@/lib/api/types";
import { DownloadCsvButton } from "@/components/admin/download-csv-button";

export default function AtRiskReportPage() {
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    Promise.all([atRiskApi.list(filter || undefined), adminApi.listSchools()])
      .then(([s, sc]) => {
        setStudents(s);
        setSchools(sc);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
            <Link href="/reports" className="hover:text-accent">
              Reports
            </Link>{" "}
            ▸ At-Risk
          </p>
          <h1 className="mt-1">Students Below Attendance Threshold</h1>
          <p className="text-sm text-muted mt-1">
            Each school enforces its own minimum %. Listed students are below their school&apos;s
            threshold.
          </p>
        </div>
        <DownloadCsvButton
          path="/api/export/students.csv"
          filename="students_attendance.csv"
        />
      </div>

      <GlassCard className="mb-6" padding="sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted font-semibold uppercase tracking-wide">
            Filter by school:
          </span>
          <button
            onClick={() => setFilter("")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              filter === ""
                ? "bg-gradient-to-br from-accent to-accent-2 text-white border-0"
                : "bg-white/55 border-white/70 text-ink-2"
            }`}
          >
            All
          </button>
          {schools.map((s) => (
            <button
              key={s.code}
              onClick={() => setFilter(s.code)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                filter === s.code
                  ? "bg-gradient-to-br from-accent to-accent-2 text-white border-0"
                  : "bg-white/55 border-white/70 text-ink-2"
              }`}
            >
              {s.code}
            </button>
          ))}
        </div>
      </GlassCard>

      {loading ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">Loading...</p>
        </GlassCard>
      ) : students.length === 0 ? (
        <GlassCard className="text-center py-12">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-good">All clear!</h2>
          <p className="text-muted mt-2">
            No students are currently below their school&apos;s minimum attendance.
          </p>
        </GlassCard>
      ) : (
        <GlassCard padding="none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Enrollment
                  </th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Student
                  </th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Section
                  </th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    School
                  </th>
                  <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Attendance
                  </th>
                  <th className="text-right px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Required
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.student_id}>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-mono text-xs">
                      {s.enrollment_no}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-semibold">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted text-xs">
                      {s.section_label}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">
                      <Pill variant="warn">{s.school_code}</Pill>
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-right">
                      <span className="text-bad font-bold">
                        {s.overall_percentage.toFixed(1)}%
                      </span>
                      <span className="text-muted text-[11px] ml-1">
                        ({s.present_classes}/{s.total_classes})
                      </span>
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-right text-muted">
                      {s.school_min_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

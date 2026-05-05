"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Pill } from "@/components/ui/pill";
import { atRiskApi } from "@/lib/api";
import type { SessionHistoryItem } from "@/lib/api/types";

type Range = "today" | "week" | "term";

export default function FacultyAttendanceHistoryPage() {
  const params = useParams();
  const assignmentId = params.assignmentId as string;

  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("week");

  const fetchData = useCallback(() => {
    atRiskApi
      .assignmentHistory(assignmentId)
      .then(setSessions)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [assignmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = sessions.filter((s) => {
    if (range === "today") return s.session_date === new Date().toISOString().slice(0, 10);
    if (range === "week") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return new Date(s.session_date) >= sevenDaysAgo;
    }
    return true;
  });

  const totalSessions = filtered.length;
  const totalPresent = filtered.reduce((acc, s) => acc + s.present_count, 0);
  const totalCapacity = filtered.reduce((acc, s) => acc + s.total_students, 0);
  const avgRate = totalCapacity > 0 ? (totalPresent / totalCapacity) * 100 : 0;

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          <Link href="/faculty" className="hover:text-accent">
            Faculty
          </Link>{" "}
          ▸ Attendance History
        </p>
        <h1 className="mt-1">Session History</h1>
      </div>

      <div className="flex gap-2 mb-6">
        {(["today", "week", "term"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              range === r
                ? "bg-white text-ink shadow-[0_4px_14px_rgba(28,32,82,0.08)]"
                : "bg-white/55 border-white/70 text-muted"
            }`}
          >
            {r === "today" ? "Today" : r === "week" ? "This Week" : "Term"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <KpiCard label="Sessions" value={String(totalSessions)} />
        <KpiCard label="Avg Rate" value={`${avgRate.toFixed(1)}%`} />
        <KpiCard label="Total Present" value={String(totalPresent)} />
      </div>

      <h2 className="mb-3">Sessions</h2>
      {loading ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">Loading...</p>
        </GlassCard>
      ) : filtered.length === 0 ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">No sessions in this range</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const rate = s.total_students > 0 ? (s.present_count / s.total_students) * 100 : 0;
            return (
              <GlassCard key={s.session_id} padding="sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{s.session_date}</div>
                    <div className="text-xs text-muted font-mono">
                      {new Date(s.started_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {s.ended_at &&
                        ` – ${new Date(s.ended_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm">
                      <span className="font-bold">{s.present_count}</span>
                      <span className="text-muted text-xs"> / {s.total_students}</span>
                    </span>
                    <Pill variant={rate >= 75 ? "done" : "warn"}>
                      {rate.toFixed(0)}%
                    </Pill>
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

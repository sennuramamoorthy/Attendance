"use client";

import { useState, useEffect, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { attendanceApi, cicApi } from "@/lib/api";
import type { RosterStudent } from "@/lib/api/types";

export default function CICPage() {
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "below75" | "late">("all");

  const fetchRoster = useCallback(() => {
    cicApi
      .getRoster()
      .then((data) => setRoster(data))
      .catch((err) => console.error("Failed to load roster:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  function updateStatus(recordId: string, status: string) {
    attendanceApi
      .updateRecord(recordId, status)
      .then(() => fetchRoster())
      .catch((err) => console.error("Failed to update status:", err));
  }

  const filtered = roster.filter((s) => {
    if (filter === "late") return s.status === "late";
    return true;
  });

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Class-in-Charge
        </p>
        <h1 className="mt-1">Section Roster</h1>
      </div>

      <div className="flex gap-2 mb-6">
        {(["all", "below75", "late"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === f
                ? "bg-white text-ink shadow-[0_4px_14px_rgba(28,32,82,0.08)]"
                : "bg-white/55 border-white/70 text-muted"
            }`}
          >
            {f === "all" ? "All" : f === "below75" ? "Below 75%" : "Late today"}
          </button>
        ))}
      </div>

      {loading ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">Loading roster...</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {filtered.map((student) => (
            <GlassCard key={student.id} padding="sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-2 to-accent grid place-items-center text-white text-[10px] font-bold">
                    {student.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{student.name}</div>
                    <div className="text-[11px] text-muted font-mono">
                      {student.enrollment_no}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {student.status === "present" ? (
                    <Pill variant="done">Present</Pill>
                  ) : student.status === "late" ? (
                    <Pill variant="warn">Late</Pill>
                  ) : student.status === "absent" ? (
                    <Pill variant="default">Absent</Pill>
                  ) : (
                    <Pill variant="default">--</Pill>
                  )}

                  {student.record_id && student.status !== "present" && (
                    <Button
                      onClick={() => updateStatus(student.record_id!, "present")}
                      className="text-[10px] px-2 py-1"
                    >
                      Mark Present
                    </Button>
                  )}
                </div>
              </div>
            </GlassCard>
          ))}

          {filtered.length === 0 && (
            <GlassCard className="text-center py-8">
              <p className="text-muted">No students in your section</p>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}

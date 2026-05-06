"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { reportsApi } from "@/lib/api";

interface DrilldownLevel {
  type: "university" | "school" | "department" | "subject" | "student";
  id?: string;
  label: string;
  percentage?: number | null;
}

export default function ReportsPage() {
  const [breadcrumb, setBreadcrumb] = useState<DrilldownLevel[]>([
    { type: "university", label: "Takshashila University" },
  ]);
  const [children, setChildren] = useState<DrilldownLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("all");
  const [range, setRange] = useState("term");

  const fetchLevel = useCallback(() => {
    const current = breadcrumb[breadcrumb.length - 1];
    reportsApi
      .getReport(current.type, current.id)
      .then((data) =>
        setChildren(
          data.children.map((c) => ({
            type: c.type as DrilldownLevel["type"],
            id: c.id,
            label: c.label,
            percentage: c.percentage,
          }))
        )
      )
      .catch(() => setChildren([]))
      .finally(() => setLoading(false));
  }, [breadcrumb]);

  useEffect(() => {
    fetchLevel();
  }, [fetchLevel]);

  function drillDown(child: DrilldownLevel) {
    setBreadcrumb([...breadcrumb, child]);
  }

  function navigateTo(index: number) {
    setBreadcrumb(breadcrumb.slice(0, index + 1));
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
            <Link href="/reports" className="hover:text-accent">
              Reports
            </Link>{" "}
            ▸ Drill-down
          </p>
          <h1 className="mt-1">Drill-down explorer</h1>
        </div>
        <Link href="/reports/at-risk">
          <Button>⚠ At-risk students</Button>
        </Link>
      </div>

      <GlassCard className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-semibold">Scope:</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-full bg-white/60 border border-white/70 font-semibold"
            >
              <option value="all">All schools</option>
              <option value="ENG">Engineering</option>
              <option value="ART">Arts & Science</option>
              <option value="BUS">Business</option>
              <option value="HSP">Hospital Science</option>
              <option value="MED">Medical</option>
              <option value="HRS">HR & Science</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-semibold">Range:</span>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-full bg-white/60 border border-white/70 font-semibold"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="term">Term</option>
            </select>
          </div>
          <Button className="ml-auto text-xs">Export CSV</Button>
        </div>
      </GlassCard>

      <GlassCard className="mb-6" padding="sm">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="text-muted uppercase tracking-wide">Drill-down:</span>
          {breadcrumb.map((level, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted">▸</span>}
              <button
                onClick={() => navigateTo(i)}
                className={`hover:text-accent ${
                  i === breadcrumb.length - 1 ? "text-ink font-bold" : "text-muted"
                }`}
              >
                {level.label}
              </button>
            </span>
          ))}
        </div>
      </GlassCard>

      {loading ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">Loading...</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {children.map((child, i) => (
            <GlassCard key={i} padding="sm">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => drillDown(child)}
                  className="flex items-center gap-3 hover:text-accent transition-colors text-left"
                >
                  <span className="text-muted">↳</span>
                  <span className="font-semibold">{child.label}</span>
                </button>
                <div className="flex items-center gap-3">
                  {child.percentage != null && (
                    <span
                      className={`text-sm font-bold ${
                        child.percentage >= 75 ? "text-good" : "text-bad"
                      }`}
                    >
                      {child.percentage.toFixed(1)}%
                    </span>
                  )}
                  <div className="w-24 h-2 bg-white/50 rounded-full overflow-hidden border border-white/70">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                      style={{ width: `${child.percentage ?? 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </GlassCard>
          ))}

          {children.length === 0 && (
            <GlassCard className="text-center py-8">
              <p className="text-muted">No data available for this level</p>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}

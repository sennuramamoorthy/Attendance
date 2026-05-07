"use client";

/**
 * Per-student session editor for the CIC dashboard.
 *
 * Lists every session in the active window for one student, with the
 * student's current status (or "no record"). Each row has four buttons
 * (Present / Late / Absent / Excused); clicking one calls
 * /api/cic/manual-mark which upserts the record. The local state is
 * patched optimistically so the UI feels instant.
 *
 * Backend enforces that the student is in the CIC's section AND the
 * session belongs to that same section, so a stale link can't escape
 * the CIC's scope.
 */

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { cicApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import type {
  AttendanceStatus,
  AttendanceWindow,
  CicSessionRecord,
  CicStudentSessionsResponse,
} from "@/lib/api/types";

interface Props {
  studentId: string;
  studentName: string;
  window: AttendanceWindow;
  onClose: () => void;
  onSaved: () => void; // parent refreshes the table aggregates
}

const WINDOW_LABELS: Record<AttendanceWindow, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  term: "Term",
};

const STATUSES: { value: AttendanceStatus; label: string; short: string }[] = [
  { value: "present", label: "Present", short: "P" },
  { value: "late", label: "Late", short: "L" },
  { value: "absent", label: "Absent", short: "A" },
  { value: "excused", label: "Excused", short: "E" },
];

export function StudentSessionsModal({
  studentId,
  studentName,
  window,
  onClose,
  onSaved,
}: Props) {
  const [data, setData] = useState<CicStudentSessionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [savedAny, setSavedAny] = useState(false);

  useEffect(() => {
    cicApi
      .getStudentSessions(studentId, window)
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load this student's sessions"
        )
      )
      .finally(() => setLoading(false));
  }, [studentId, window]);

  function setStatus(session: CicSessionRecord, status: AttendanceStatus) {
    if (session.status === status) return; // no-op click
    setSavingSessionId(session.session_id);
    setError("");
    cicApi
      .manualMark({
        student_id: studentId,
        session_id: session.session_id,
        status,
      })
      .then(() => {
        // Patch the local row so the modal updates without a refetch.
        setData((prev) =>
          prev
            ? {
                ...prev,
                sessions: prev.sessions.map((s) =>
                  s.session_id === session.session_id
                    ? { ...s, status, record_id: s.record_id ?? "pending" }
                    : s
                ),
              }
            : prev
        );
        setSavedAny(true);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Update failed")
      )
      .finally(() => setSavingSessionId(null));
  }

  function handleClose() {
    if (savedAny) onSaved(); // tell parent to refresh aggregates
    onClose();
  }

  return (
    <Modal
      open
      onClose={handleClose}
      title={`Edit attendance · ${studentName}`}
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Window: <strong>{WINDOW_LABELS[window]}</strong>
          {data && (
            <>
              {" "}
              ({data.window_start} → {data.window_end} ·{" "}
              {data.sessions.length} session
              {data.sessions.length === 1 ? "" : "s"})
            </>
          )}
        </p>

        {error && <p className="text-bad text-xs font-medium">{error}</p>}

        {loading ? (
          <p className="text-muted text-sm py-4 text-center">Loading...</p>
        ) : !data || data.sessions.length === 0 ? (
          <p className="text-muted text-sm py-4 text-center">
            No sessions in this window.
          </p>
        ) : (
          <div className="-mx-2 max-h-[60vh] overflow-y-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Date
                  </th>
                  <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Subject
                  </th>
                  <th className="text-left px-2 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Status
                  </th>
                  <th className="text-right px-2 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Set
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.session_id}>
                    <td className="px-2 py-2 border-t border-[var(--line-2)] align-top">
                      <div className="font-mono text-[11px]">
                        {s.session_date}
                      </div>
                      {s.period_number != null && (
                        <div className="text-[10px] text-muted">
                          P{s.period_number} · {s.start_time}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 border-t border-[var(--line-2)] align-top">
                      <div className="font-mono text-[10.5px] text-muted">
                        {s.subject_code}
                      </div>
                      <div className="font-semibold text-[11.5px] truncate max-w-[180px]">
                        {s.subject_name}
                      </div>
                      <div className="text-[10px] text-muted truncate max-w-[180px]">
                        {s.faculty_name}
                      </div>
                    </td>
                    <td className="px-2 py-2 border-t border-[var(--line-2)] align-top">
                      <StatusPill status={s.status} />
                    </td>
                    <td className="px-2 py-2 border-t border-[var(--line-2)] align-top">
                      <div className="flex justify-end gap-1">
                        {STATUSES.map((opt) => {
                          const active = s.status === opt.value;
                          const disabled = savingSessionId === s.session_id;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setStatus(s, opt.value)}
                              disabled={disabled}
                              title={opt.label}
                              className={`w-7 h-7 rounded-md border text-[11px] font-bold ${
                                active
                                  ? buttonActiveClass(opt.value)
                                  : "bg-white/60 border-white/70 text-muted hover:bg-white/85"
                              } ${disabled ? "opacity-50" : "cursor-pointer"}`}
                            >
                              {opt.short}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-white/70">
          <button
            onClick={handleClose}
            className="text-xs font-semibold text-muted hover:text-ink"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

function buttonActiveClass(value: AttendanceStatus): string {
  // Mirror the colour conventions of the status pills so the active
  // button visually matches the resulting state.
  switch (value) {
    case "present":
      return "bg-good/20 border-good/40 text-[#0a8a6b]";
    case "late":
      return "bg-warn/20 border-warn/40 text-[#a06200]";
    case "absent":
      return "bg-bad/20 border-bad/40 text-bad";
    case "excused":
      return "bg-accent/15 border-accent/30 text-accent";
  }
}

function StatusPill({ status }: { status: AttendanceStatus | null }) {
  if (status === "present") return <Pill variant="done">Present</Pill>;
  if (status === "late") return <Pill variant="warn">Late</Pill>;
  if (status === "absent") return <Pill variant="default">Absent</Pill>;
  if (status === "excused") return <Pill variant="upcoming">Excused</Pill>;
  return <Pill variant="default">No record</Pill>;
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { adminApi } from "@/lib/api";
import type { Section, Program, StudentRow } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { BulkUploadCard } from "@/components/admin/bulk-upload-card";

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [search, setSearch] = useState("");

  const fetchAll = useCallback(() => {
    Promise.all([adminApi.listStudents(), adminApi.listSections(), adminApi.listPrograms()])
      .then(([s, sec, p]) => {
        setStudents(s);
        setSections(sec);
        setPrograms(p);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function deleteStudent(s: StudentRow) {
    if (!confirm(`Delete student "${s.full_name}" (${s.enrollment_no})?`)) return;
    adminApi
      .deleteStudent(s.id)
      .then(fetchAll)
      .catch((err) => alert(err instanceof ApiError ? err.message : "Delete failed"));
  }

  function sectionLabel(id: string): string {
    const sec = sections.find((s) => s.id === id);
    if (!sec) return "—";
    const prog = programs.find((p) => p.id === sec.program_id);
    return `${prog?.code ?? "?"} · Y${sec.year} ${sec.division}`;
  }

  const term = search.toLowerCase();
  const filtered = term
    ? students.filter(
        (s) =>
          s.full_name.toLowerCase().includes(term) ||
          s.enrollment_no.toLowerCase().includes(term) ||
          s.email.toLowerCase().includes(term)
      )
    : students;

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Admin &middot; Students
        </p>
        <h1 className="mt-1">Student Management</h1>
      </div>

      <BulkUploadCard
        type="students"
        columns={[
          "email",
          "full_name",
          "enrollment_no",
          "program_code",
          "year",
          "division",
          "admitted_year",
          "phone",
        ]}
        notes="Section is identified by program_code + year + division. Phone is optional."
        onUploaded={fetchAll}
      />

      <div className="flex items-center justify-between mb-3 mt-6">
        <h2>Existing students ({filtered.length})</h2>
        <input
          placeholder="Search name, enrollment, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm w-72"
        />
      </div>

      {loading ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">Loading...</p>
        </GlassCard>
      ) : (
        <GlassCard padding="none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Enrollment</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Name</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Email</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Section</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Year</th>
                  <th className="text-right px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-mono text-xs">{s.enrollment_no}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-semibold">{s.full_name}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted">{s.email}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">{sectionLabel(s.section_id)}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-xs">{s.admitted_year}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-right whitespace-nowrap">
                      <button onClick={() => setEditing(s)} className="text-xs text-muted hover:text-accent mr-3">
                        ✎ Edit
                      </button>
                      <button onClick={() => deleteStudent(s)} className="text-xs text-muted hover:text-bad">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
                      {search ? "No matches" : "No students yet"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {editing && (
        <StudentEditModal
          key={editing.id}
          student={editing}
          sections={sections}
          programs={programs}
          onClose={() => setEditing(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}

function StudentEditModal({
  student,
  sections,
  programs,
  onClose,
  onSaved,
}: {
  student: StudentRow;
  sections: Section[];
  programs: Program[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: student.full_name,
    enrollment_no: student.enrollment_no,
    section_id: student.section_id,
    admitted_year: student.admitted_year,
    phone: student.phone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    adminApi
      .updateStudent(student.id, form)
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Update failed"))
      .finally(() => setSaving(false));
  }

  return (
    <Modal open onClose={onClose} title="Edit Student">
      <form onSubmit={submit} className="space-y-3">
        <input
          placeholder="Full name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <input
          placeholder="Enrollment number"
          value={form.enrollment_no}
          onChange={(e) => setForm({ ...form, enrollment_no: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <select
          value={form.section_id}
          onChange={(e) => setForm({ ...form, section_id: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        >
          {sections.map((sec) => {
            const prog = programs.find((p) => p.id === sec.program_id);
            return (
              <option key={sec.id} value={sec.id}>
                {prog?.code ?? "?"} · Y{sec.year} {sec.division}
              </option>
            );
          })}
        </select>
        <input
          type="number"
          placeholder="Admitted year"
          value={form.admitted_year}
          onChange={(e) =>
            setForm({ ...form, admitted_year: parseInt(e.target.value) || 2025 })
          }
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        {error && <p className="text-bad text-xs">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

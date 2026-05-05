"use client";

import { useState, useEffect, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";
import type { Assignment, Faculty, Program, Section, Subject } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { BulkUploadCard } from "@/components/admin/bulk-upload-card";
import { Modal } from "@/components/ui/modal";

export default function AdminAssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [form, setForm] = useState({
    subject_id: "",
    faculty_id: "",
    section_id: "",
    academic_year: new Date().getFullYear(),
    term: 1,
  });

  const fetchAll = useCallback(() => {
    Promise.all([
      adminApi.listAssignments(),
      adminApi.listSubjects(),
      adminApi.listFaculty(),
      adminApi.listSections(),
      adminApi.listPrograms(),
    ])
      .then(([a, s, f, sec, p]) => {
        setAssignments(a);
        setSubjects(s);
        setFaculty(f);
        setSections(sec);
        setPrograms(p);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.subject_id || !form.faculty_id || !form.section_id) {
      setError("Select subject, faculty, and section");
      return;
    }
    adminApi
      .createAssignment(form)
      .then(() => {
        setShowForm(false);
        setForm({
          subject_id: "",
          faculty_id: "",
          section_id: "",
          academic_year: new Date().getFullYear(),
          term: 1,
        });
        fetchAll();
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to create assignment")
      );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
            Admin &middot; Assignments
          </p>
          <h1 className="mt-1">Subject ↔ Faculty Assignments</h1>
        </div>
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Assignment"}
        </Button>
      </div>

      <BulkUploadCard
        type="assignments"
        columns={[
          "subject_code",
          "faculty_employee_id",
          "program_code",
          "year",
          "division",
          "academic_year",
          "term",
        ]}
        notes="Identifies subject by code, faculty by employee_id, section by program_code+year+division."
        onUploaded={fetchAll}
      />

      {showForm && (
        <GlassCard className="mb-4">
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <select
              value={form.subject_id}
              onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
              className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            >
              <option value="">Subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
            <select
              value={form.faculty_id}
              onChange={(e) => setForm({ ...form, faculty_id: e.target.value })}
              className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            >
              <option value="">Faculty</option>
              {faculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.full_name}
                </option>
              ))}
            </select>
            <select
              value={form.section_id}
              onChange={(e) => setForm({ ...form, section_id: e.target.value })}
              className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            >
              <option value="">Section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Y{s.year} {s.division}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={form.academic_year}
              onChange={(e) =>
                setForm({ ...form, academic_year: parseInt(e.target.value) })
              }
              className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              placeholder="Year"
              required
            />
            <select
              value={form.term}
              onChange={(e) => setForm({ ...form, term: parseInt(e.target.value) })}
              className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
            >
              <option value={1}>Term 1</option>
              <option value={2}>Term 2</option>
            </select>
            {error && (
              <p className="text-bad text-xs col-span-full">{error}</p>
            )}
            <div className="col-span-full">
              <Button variant="primary" type="submit">
                Create
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

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
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Subject</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Faculty</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Section</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Year / Term</th>
                  <th className="text-right px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-semibold">
                      {a.subject_code} · {a.subject_name}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">{a.faculty_name}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted">{a.section_label}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-mono text-xs">
                      {a.academic_year} · T{a.term}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-right whitespace-nowrap">
                      <button onClick={() => setEditing(a)} className="text-xs text-muted hover:text-accent mr-3">
                        ✎ Edit
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Delete assignment ${a.subject_code} → ${a.faculty_name}?`)) return;
                          adminApi
                            .deleteAssignment(a.id)
                            .then(fetchAll)
                            .catch((err) => alert(err instanceof ApiError ? err.message : "Delete failed"));
                        }}
                        className="text-xs text-muted hover:text-bad"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                      No assignments yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {editing && (
        <AssignmentEditModal
          key={editing.id}
          assignment={editing}
          subjects={subjects}
          faculty={faculty}
          sections={sections}
          programs={programs}
          onClose={() => setEditing(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}

function AssignmentEditModal({
  assignment,
  subjects,
  faculty,
  sections,
  programs,
  onClose,
  onSaved,
}: {
  assignment: Assignment;
  subjects: Subject[];
  faculty: Faculty[];
  sections: Section[];
  programs: Program[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    subject_id: assignment.subject_id,
    faculty_id: assignment.faculty_id,
    section_id: assignment.section_id,
    academic_year: assignment.academic_year,
    term: assignment.term,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    adminApi
      .updateAssignment(assignment.id, form)
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Update failed"))
      .finally(() => setSaving(false));
  }

  return (
    <Modal open onClose={onClose} title="Edit Assignment">
      <form onSubmit={submit} className="space-y-3">
        <select
          value={form.subject_id}
          onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
        <select
          value={form.faculty_id}
          onChange={(e) => setForm({ ...form, faculty_id: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        >
          {faculty.map((f) => (
            <option key={f.id} value={f.id}>
              {f.full_name}
            </option>
          ))}
        </select>
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
          value={form.academic_year}
          onChange={(e) => setForm({ ...form, academic_year: parseInt(e.target.value) || 2025 })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <select
          value={form.term}
          onChange={(e) => setForm({ ...form, term: parseInt(e.target.value) })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        >
          <option value={1}>Term 1</option>
          <option value={2}>Term 2</option>
        </select>
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

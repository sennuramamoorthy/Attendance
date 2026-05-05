"use client";

import { useState, useEffect, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { adminApi } from "@/lib/api";
import type { Department, School, Subject } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { BulkUploadCard } from "@/components/admin/bulk-upload-card";

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Subject | null>(null);

  const fetchAll = useCallback(() => {
    Promise.all([
      adminApi.listSubjects(),
      adminApi.listDepartments(),
      adminApi.listSchools(),
    ])
      .then(([s, d, sc]) => {
        setSubjects(s);
        setDepartments(d);
        setSchools(sc);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const schoolByDept = (id: string) => {
    const d = departments.find((x) => x.id === id);
    return d ? schools.find((s) => s.id === d.school_id)?.code ?? "—" : "—";
  };
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "—";

  function deleteSubject(s: Subject) {
    if (!confirm(`Delete subject "${s.code} ${s.name}"?`)) return;
    adminApi
      .deleteSubject(s.id)
      .then(fetchAll)
      .catch((err) => alert(err instanceof ApiError ? err.message : "Delete failed"));
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Admin &middot; Subjects
        </p>
        <h1 className="mt-1">Subject Management</h1>
      </div>

      <BulkUploadCard
        type="subjects"
        columns={["code", "name", "department_code", "credits", "type"]}
        notes="type is 'theory', 'lab', or 'tutorial'."
        onUploaded={fetchAll}
      />

      <h2 className="mb-3 mt-6">Existing subjects</h2>
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
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Code</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Name</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Department</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Credits</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Type</th>
                  <th className="text-right px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-mono text-xs">{s.code}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-semibold">{s.name}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted">
                      {schoolByDept(s.department_id)} · {deptName(s.department_id)}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">{s.credits}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">{s.type}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-right whitespace-nowrap">
                      <button onClick={() => setEditing(s)} className="text-xs text-muted hover:text-accent mr-3">
                        ✎ Edit
                      </button>
                      <button onClick={() => deleteSubject(s)} className="text-xs text-muted hover:text-bad">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {subjects.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
                      No subjects yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {editing && (
        <SubjectEditModal
          key={editing.id}
          subject={editing}
          departments={departments}
          schools={schools}
          onClose={() => setEditing(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}

function SubjectEditModal({
  subject,
  departments,
  schools,
  onClose,
  onSaved,
}: {
  subject: Subject;
  departments: Department[];
  schools: School[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    code: subject.code,
    name: subject.name,
    department_id: subject.department_id,
    credits: subject.credits,
    type: subject.type,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const schoolByDept = (id: string) => {
    const d = departments.find((x) => x.id === id);
    return d ? schools.find((s) => s.id === d.school_id)?.code ?? "—" : "—";
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    adminApi
      .updateSubject(subject.id, form)
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Update failed"))
      .finally(() => setSaving(false));
  }

  return (
    <Modal open onClose={onClose} title="Edit Subject">
      <form onSubmit={submit} className="space-y-3">
        <input
          placeholder="Code"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <select
          value={form.department_id}
          onChange={(e) => setForm({ ...form, department_id: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {schoolByDept(d.id)} · {d.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={10}
          value={form.credits}
          onChange={(e) => setForm({ ...form, credits: parseInt(e.target.value) || 1 })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        >
          <option value="theory">theory</option>
          <option value="lab">lab</option>
          <option value="tutorial">tutorial</option>
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

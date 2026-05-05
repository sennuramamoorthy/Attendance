"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Modal } from "@/components/ui/modal";
import { adminApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import type { Department, School } from "@/lib/api/types";

interface SchoolsListProps {
  schools: School[];
  departments: Department[];
}

export function SchoolsList({ schools, departments }: SchoolsListProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<School | null>(null);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  function onDelete(school: School) {
    if (!confirm(`Delete school "${school.name}"? This cannot be undone.`)) return;
    adminApi
      .deleteSchool(school.id)
      .then(() => router.refresh())
      .catch((err) => alert(err instanceof ApiError ? err.message : "Delete failed"));
  }

  function onDeleteDept(dept: Department) {
    if (!confirm(`Delete department "${dept.name}"?`)) return;
    adminApi
      .deleteDepartment(dept.id)
      .then(() => router.refresh())
      .catch((err) => alert(err instanceof ApiError ? err.message : "Delete failed"));
  }

  return (
    <>
      <div className="space-y-4">
        {schools.map((school) => {
          const depts = departments.filter((d) => d.school_id === school.id);
          return (
            <GlassCard key={school.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-base">{school.name}</h3>
                  <p className="text-xs text-muted font-mono mt-0.5">{school.code}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill variant={school.term_type === "semester" ? "upcoming" : "default"}>
                    {school.term_type}
                  </Pill>
                  <Pill variant="done">{school.min_attendance_pct}% min</Pill>
                  <Button onClick={() => setEditing(school)} className="text-xs px-2.5 py-1">
                    ✎ Edit
                  </Button>
                  <Button onClick={() => onDelete(school)} className="text-xs px-2.5 py-1 text-bad">
                    Delete
                  </Button>
                </div>
              </div>

              {depts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                  {depts.map((dept) => (
                    <span
                      key={dept.id}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/60 border border-white/70 text-ink-2 inline-flex items-center gap-1"
                    >
                      {dept.name}
                      <button
                        onClick={() => setEditingDept(dept)}
                        className="text-muted hover:text-ink"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => onDeleteDept(dept)}
                        className="text-muted hover:text-bad"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </GlassCard>
          );
        })}

        {schools.length === 0 && (
          <GlassCard className="text-center py-8">
            <p className="text-muted">No schools configured yet.</p>
          </GlassCard>
        )}
      </div>

      {editing && (
        <SchoolEditModal
          key={editing.id}
          school={editing}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {editingDept && (
        <DepartmentEditModal
          key={editingDept.id}
          department={editingDept}
          schools={schools}
          onClose={() => setEditingDept(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}

function SchoolEditModal({
  school,
  onClose,
  onSaved,
}: {
  school: School;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<{
    name: string;
    code: string;
    term_type: "semester" | "yearly";
    min_attendance_pct: number;
  }>({
    name: school.name,
    code: school.code,
    term_type: school.term_type,
    min_attendance_pct: school.min_attendance_pct,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    adminApi
      .updateSchool(school.id, form)
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Update failed"))
      .finally(() => setSaving(false));
  }

  return (
    <Modal open onClose={onClose} title="Edit School">
      <form onSubmit={submit} className="space-y-3">
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <input
          placeholder="Code"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <select
          value={form.term_type}
          onChange={(e) =>
            setForm({ ...form, term_type: e.target.value as "semester" | "yearly" })
          }
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        >
          <option value="semester">semester</option>
          <option value="yearly">yearly</option>
        </select>
        <input
          type="number"
          min={0}
          max={100}
          value={form.min_attendance_pct}
          onChange={(e) =>
            setForm({ ...form, min_attendance_pct: parseInt(e.target.value) || 0 })
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

function DepartmentEditModal({
  department,
  schools,
  onClose,
  onSaved,
}: {
  department: Department;
  schools: School[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: department.name,
    code: department.code,
    school_id: department.school_id,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    adminApi
      .updateDepartment(department.id, form)
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Update failed"))
      .finally(() => setSaving(false));
  }

  return (
    <Modal open onClose={onClose} title="Edit Department">
      <form onSubmit={submit} className="space-y-3">
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <input
          placeholder="Code"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <select
          value={form.school_id}
          onChange={(e) => setForm({ ...form, school_id: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        >
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
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

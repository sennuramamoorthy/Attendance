"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";
import type { Department, Faculty, School } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { BulkUploadCard } from "@/components/admin/bulk-upload-card";
import { Modal } from "@/components/ui/modal";

export default function AdminFacultyPage() {
  const router = useRouter();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    employee_id: "",
    department_id: "",
  });
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Faculty | null>(null);

  const fetchAll = useCallback(() => {
    Promise.all([
      adminApi.listFaculty(),
      adminApi.listDepartments(),
      adminApi.listSchools(),
    ])
      .then(([f, d, s]) => {
        setFaculty(f);
        setDepartments(d);
        setSchools(s);
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
    if (!form.department_id) {
      setError("Select a department");
      return;
    }
    adminApi
      .createFaculty(form)
      .then(() => {
        setShowForm(false);
        setForm({ full_name: "", email: "", employee_id: "", department_id: "" });
        fetchAll();
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to create faculty")
      );
  }

  const schoolByDept = (deptId: string) => {
    const dept = departments.find((d) => d.id === deptId);
    if (!dept) return "—";
    return schools.find((s) => s.id === dept.school_id)?.code ?? "—";
  };
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "—";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
            Admin &middot; Faculty
          </p>
          <h1 className="mt-1">Faculty Members</h1>
        </div>
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Add Faculty"}
        </Button>
      </div>

      <BulkUploadCard
        type="faculty"
        columns={["email", "full_name", "employee_id", "department_code", "phone"]}
        notes="department_code references an existing department (e.g. ENG-01). Phone is optional."
        onUploaded={fetchAll}
      />

      {showForm && (
        <GlassCard className="mb-4 max-w-2xl">
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Full name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
                required
              />
              <input
                placeholder="Employee ID (e.g. FAC-ENG-118)"
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
                required
              />
              <select
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
                required
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {schoolByDept(d.id)} · {d.name}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-bad text-xs">{error}</p>}
            <Button variant="primary" type="submit">
              Create Faculty
            </Button>
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
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Employee ID</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Name</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Email</th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Department</th>
                  <th className="text-right px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {faculty.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => router.push(`/admin/faculty/${f.id}`)}
                    className="cursor-pointer hover:bg-white/40 transition-colors"
                  >
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-mono text-xs">{f.employee_id}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-semibold">{f.full_name}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted">{f.email}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">
                      {schoolByDept(f.department_id)} · {deptName(f.department_id)}
                    </td>
                    <td
                      className="px-4 py-3 border-t border-[var(--line-2)] text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button onClick={() => setEditing(f)} className="text-xs text-muted hover:text-accent mr-3">
                        ✎ Edit
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Delete ${f.full_name}?`)) return;
                          adminApi.deleteFaculty(f.id).then(fetchAll).catch((err) =>
                            alert(err instanceof ApiError ? err.message : "Delete failed")
                          );
                        }}
                        className="text-xs text-muted hover:text-bad"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {faculty.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                      No faculty yet — add one above
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {editing && (
        <FacultyEditModal
          key={editing.id}
          faculty={editing}
          departments={departments}
          schools={schools}
          onClose={() => setEditing(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}

function FacultyEditModal({
  faculty,
  departments,
  schools,
  onClose,
  onSaved,
}: {
  faculty: Faculty;
  departments: Department[];
  schools: School[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: faculty.full_name,
    employee_id: faculty.employee_id,
    department_id: faculty.department_id,
    phone: "",
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
      .updateFaculty(faculty.id, form)
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Update failed"))
      .finally(() => setSaving(false));
  }

  return (
    <Modal open onClose={onClose} title="Edit Faculty">
      <form onSubmit={submit} className="space-y-3">
        <input
          placeholder="Full name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <input
          placeholder="Employee ID"
          value={form.employee_id}
          onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
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

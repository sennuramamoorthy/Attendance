"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";
import type { Department, Program, School, Section } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { BulkUploadCard } from "@/components/admin/bulk-upload-card";
import { Modal } from "@/components/ui/modal";

export default function AdminSectionsPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [progForm, setProgForm] = useState({
    department_id: "",
    name: "",
    code: "",
    duration_years: 4,
  });
  const [secForm, setSecForm] = useState({ program_id: "", year: 1, division: "A" });
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);

  const fetchAll = useCallback(() => {
    Promise.all([
      adminApi.listSchools(),
      adminApi.listDepartments(),
      adminApi.listPrograms(),
      adminApi.listSections(),
    ])
      .then(([s, d, p, sec]) => {
        setSchools(s);
        setDepartments(d);
        setPrograms(p);
        setSections(sec);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function createProgram(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    adminApi
      .createProgram(progForm)
      .then(() => {
        setProgForm({ department_id: "", name: "", code: "", duration_years: 4 });
        fetchAll();
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to create program")
      );
  }

  function createSection(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    adminApi
      .createSection(secForm)
      .then(() => {
        setSecForm({ program_id: "", year: 1, division: "A" });
        fetchAll();
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to create section")
      );
  }

  const schoolByDept = (id: string) => {
    const d = departments.find((x) => x.id === id);
    return d ? schools.find((s) => s.id === d.school_id)?.code ?? "—" : "—";
  };
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "—";
  const programName = (id: string) => programs.find((p) => p.id === id)?.name ?? "—";

  function deleteProgram(p: Program) {
    if (!confirm(`Delete program "${p.name}"?`)) return;
    adminApi
      .deleteProgram(p.id)
      .then(fetchAll)
      .catch((err) => alert(err instanceof ApiError ? err.message : "Delete failed"));
  }

  function deleteSection(s: Section) {
    if (!confirm(`Delete section Y${s.year} ${s.division}?`)) return;
    adminApi
      .deleteSection(s.id)
      .then(fetchAll)
      .catch((err) => alert(err instanceof ApiError ? err.message : "Delete failed"));
  }

  if (loading) {
    return (
      <div>
        <h1 className="mb-6">Sections</h1>
        <GlassCard className="text-center py-8">
          <p className="text-muted">Loading...</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Admin &middot; Programs & Sections
        </p>
        <h1 className="mt-1">Programs and Sections</h1>
      </div>

      <BulkUploadCard
        type="programs"
        columns={["department_code", "name", "code", "duration_years"]}
        notes="department_code references an existing department (e.g. ENG-01)."
        onUploaded={fetchAll}
      />
      <BulkUploadCard
        type="sections"
        columns={["program_code", "year", "division"]}
        notes="program_code references an existing program (e.g. BTECH-CSE)."
        onUploaded={fetchAll}
      />
      <BulkUploadCard
        type="timetable"
        columns={[
          "program_code",
          "year",
          "division",
          "day",
          "period_number",
          "subject_code",
          "duration_periods",
          "room_override",
        ]}
        notes="Each row places one subject in one period of one day for a section. day accepts Mon/Tue/.../Sun or 0–6. duration_periods defaults to 1; use 2 for labs that span two periods. room_override is blank for theory (uses the section's classroom) and set to a lab block (e.g. E-Lab1) for labs. The subject must already be assigned to the section."
        onUploaded={fetchAll}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <GlassCard>
          <h3 className="font-bold mb-3">Add Program</h3>
          <form onSubmit={createProgram} className="space-y-3">
            <select
              value={progForm.department_id}
              onChange={(e) => setProgForm({ ...progForm, department_id: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            >
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {schoolByDept(d.id)} · {d.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Program name (e.g. B.Tech Computer Science)"
              value={progForm.name}
              onChange={(e) => setProgForm({ ...progForm, name: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            />
            <input
              placeholder="Code (e.g. BTECH-CSE)"
              value={progForm.code}
              onChange={(e) => setProgForm({ ...progForm, code: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            />
            <input
              type="number"
              min={1}
              max={6}
              placeholder="Duration (years)"
              value={progForm.duration_years}
              onChange={(e) =>
                setProgForm({ ...progForm, duration_years: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
            />
            <Button variant="primary" type="submit">
              Add Program
            </Button>
          </form>
        </GlassCard>

        <GlassCard>
          <h3 className="font-bold mb-3">Add Section</h3>
          <form onSubmit={createSection} className="space-y-3">
            <select
              value={secForm.program_id}
              onChange={(e) => setSecForm({ ...secForm, program_id: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            >
              <option value="">Select program</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min={1}
                max={6}
                placeholder="Year"
                value={secForm.year}
                onChange={(e) => setSecForm({ ...secForm, year: parseInt(e.target.value) })}
                className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
                required
              />
              <input
                placeholder="Division (A, B, ...)"
                value={secForm.division}
                onChange={(e) => setSecForm({ ...secForm, division: e.target.value })}
                className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
                required
              />
            </div>
            <Button variant="primary" type="submit">
              Add Section
            </Button>
          </form>
        </GlassCard>
      </div>

      {error && (
        <p className="text-bad text-sm font-medium mb-4">{error}</p>
      )}

      <h2 className="mb-3">Programs</h2>
      <GlassCard padding="none" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Code</th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Name</th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Department</th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Years</th>
                <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] font-mono text-xs">{p.code}</td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] font-semibold">{p.name}</td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted">
                    {schoolByDept(p.department_id)} · {deptName(p.department_id)}
                  </td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)]">{p.duration_years}</td>
                  <td className="px-4 py-3 border-t border-[var(--line-2)] text-right whitespace-nowrap">
                    <button onClick={() => setEditingProgram(p)} className="text-xs text-muted hover:text-accent mr-3">
                      ✎ Edit
                    </button>
                    <button onClick={() => deleteProgram(p)} className="text-xs text-muted hover:text-bad">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {programs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    No programs yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <h2 className="mb-3">Sections</h2>
      <GlassCard padding="none">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Section</th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Program</th>
                <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Department</th>
                <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const program = programs.find((p) => p.id === s.program_id);
                return (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/admin/sections/${s.id}`)}
                    className="cursor-pointer hover:bg-white/40 transition-colors"
                  >
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-semibold">
                      Year {s.year} {s.division}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">{programName(s.program_id)}</td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted">
                      {program ? deptName(program.department_id) : "—"}
                    </td>
                    <td
                      className="px-4 py-3 border-t border-[var(--line-2)] text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button onClick={() => setEditingSection(s)} className="text-xs text-muted hover:text-accent mr-3">
                        ✎ Edit
                      </button>
                      <button onClick={() => deleteSection(s)} className="text-xs text-muted hover:text-bad">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sections.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    No sections yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {editingProgram && (
        <ProgramEditModal
          key={editingProgram.id}
          program={editingProgram}
          departments={departments}
          schools={schools}
          onClose={() => setEditingProgram(null)}
          onSaved={fetchAll}
        />
      )}
      {editingSection && (
        <SectionEditModal
          key={editingSection.id}
          section={editingSection}
          programs={programs}
          onClose={() => setEditingSection(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}

function ProgramEditModal({
  program,
  departments,
  schools,
  onClose,
  onSaved,
}: {
  program: Program;
  departments: Department[];
  schools: School[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: program.name,
    code: program.code,
    duration_years: program.duration_years,
    department_id: program.department_id,
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
      .updateProgram(program.id, form)
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Update failed"))
      .finally(() => setSaving(false));
  }

  return (
    <Modal open onClose={onClose} title="Edit Program">
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
        <input
          type="number"
          min={1}
          max={6}
          value={form.duration_years}
          onChange={(e) => setForm({ ...form, duration_years: parseInt(e.target.value) || 1 })}
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

function SectionEditModal({
  section,
  programs,
  onClose,
  onSaved,
}: {
  section: Section;
  programs: Program[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    year: section.year,
    division: section.division,
    program_id: section.program_id,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    adminApi
      .updateSection(section.id, form)
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Update failed"))
      .finally(() => setSaving(false));
  }

  return (
    <Modal open onClose={onClose} title="Edit Section">
      <form onSubmit={submit} className="space-y-3">
        <select
          value={form.program_id}
          onChange={(e) => setForm({ ...form, program_id: e.target.value })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={6}
          value={form.year}
          onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) || 1 })}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />
        <input
          value={form.division}
          onChange={(e) => setForm({ ...form, division: e.target.value })}
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

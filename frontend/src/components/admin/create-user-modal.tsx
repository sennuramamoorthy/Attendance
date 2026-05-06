"use client";

/**
 * "+ Add User" modal — single-user create with role-aware required fields.
 *
 * Backend validates the same constraints; this UI just makes them visible
 * and prevents obvious mistakes (e.g. a CIC without a class assignment).
 *
 * Role → required scope mapping:
 *   admin / registrar / vc / chancellor → no scope
 *   dean   → school
 *   hod    → department
 *   faculty → department + employee_id
 *   cic    → section (class assignment)
 *   student → section + enrollment_no + admitted_year
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { adminApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import type {
  CreateUserRequest,
  CreateUserResponse,
  Department,
  Program,
  School,
  Section,
  UserRoleName,
} from "@/lib/api/types";

interface Props {
  schools: School[];
  departments: Department[];
  programs: Program[];
  sections: Section[];
  onClose: () => void;
  onCreated: (resp: CreateUserResponse) => void;
}

const ROLE_OPTIONS: { value: UserRoleName; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full system access" },
  { value: "registrar", label: "Registrar", hint: "Institutional reports" },
  { value: "vc", label: "Vice-Chancellor", hint: "Strategic dashboard" },
  { value: "chancellor", label: "Chancellor", hint: "University overview" },
  { value: "dean", label: "Dean", hint: "Requires school" },
  { value: "hod", label: "HOD", hint: "Requires department" },
  { value: "faculty", label: "Faculty", hint: "Requires department + employee ID" },
  { value: "cic", label: "Class-in-Charge (CIC)", hint: "Requires class (section)" },
  { value: "student", label: "Student", hint: "Requires class + enrollment number" },
];

export function CreateUserModal({
  schools,
  departments,
  programs,
  sections,
  onClose,
  onCreated,
}: Props) {
  const [form, setForm] = useState<CreateUserRequest>({
    email: "",
    full_name: "",
    phone: "",
    role: "faculty",
    provision: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Section labels need program lookup so admin sees something readable.
  const sectionLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sections) {
      const prog = programs.find((p) => p.id === s.program_id);
      map[s.id] = `${prog?.code ?? "?"} · Y${s.year} ${s.division}`;
    }
    return map;
  }, [sections, programs]);

  // For dean, group departments by school so they show their school context.
  const deptLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of departments) {
      const sc = schools.find((s) => s.id === d.school_id);
      map[d.id] = `${sc?.code ?? "?"} · ${d.name}`;
    }
    return map;
  }, [departments, schools]);

  function update<K extends keyof CreateUserRequest>(key: K, value: CreateUserRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function changeRole(role: UserRoleName) {
    // Reset role-specific fields when role flips so we don't send stale values.
    setForm({
      email: form.email,
      full_name: form.full_name,
      phone: form.phone,
      role,
      provision: form.provision,
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Local validation matching backend rules — fail fast with a clear message.
    if (!form.email || !form.full_name) {
      setError("Email and name are required");
      return;
    }
    if (form.role === "dean" && !form.school_id) {
      setError("Dean requires a school");
      return;
    }
    if ((form.role === "hod" || form.role === "faculty") && !form.department_id) {
      setError(`${form.role.toUpperCase()} requires a department`);
      return;
    }
    if (form.role === "faculty" && !form.employee_id) {
      setError("Faculty requires an employee ID");
      return;
    }
    if ((form.role === "cic" || form.role === "student") && !form.section_id) {
      setError(`${form.role === "cic" ? "CIC" : "Student"} requires a class (section)`);
      return;
    }
    if (form.role === "student") {
      if (!form.enrollment_no) {
        setError("Student requires an enrollment number");
        return;
      }
      if (!form.admitted_year) {
        setError("Student requires admitted year");
        return;
      }
    }

    setSubmitting(true);
    adminApi
      .createUser(form)
      .then(onCreated)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to create user")
      )
      .finally(() => setSubmitting(false));
  }

  const r = form.role;
  const showSchool = r === "dean";
  const showDept = r === "hod" || r === "faculty";
  const showSection = r === "cic" || r === "student";
  const showEmployeeId = r === "faculty";
  const showStudentFields = r === "student";

  return (
    <Modal open onClose={onClose} title="Create user">
      <form onSubmit={submit} className="space-y-3">
        {/* Common fields */}
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Full name *"
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
            required
          />
          <input
            type="email"
            placeholder="Email *"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
            required
          />
        </div>

        <input
          placeholder="Phone (optional)"
          value={form.phone ?? ""}
          onChange={(e) => update("phone", e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
        />

        {/* Role */}
        <div>
          <label className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted block mb-1">
            Role *
          </label>
          <select
            value={form.role}
            onChange={(e) => changeRole(e.target.value as UserRoleName)}
            className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.hint}
              </option>
            ))}
          </select>
        </div>

        {/* School (dean) */}
        {showSchool && (
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted block mb-1">
              School *
            </label>
            <select
              value={form.school_id ?? ""}
              onChange={(e) => update("school_id", e.target.value || undefined)}
              className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            >
              <option value="">Select school</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Department (hod / faculty) */}
        {showDept && (
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted block mb-1">
              Department *
            </label>
            <select
              value={form.department_id ?? ""}
              onChange={(e) =>
                update("department_id", e.target.value || undefined)
              }
              className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            >
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {deptLabel[d.id] ?? d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Section / class (cic / student) */}
        {showSection && (
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted block mb-1">
              Class (section) *
            </label>
            <select
              value={form.section_id ?? ""}
              onChange={(e) => update("section_id", e.target.value || undefined)}
              className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            >
              <option value="">Select class</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {sectionLabel[s.id] ?? `Section ${s.id}`}
                </option>
              ))}
            </select>
            {r === "cic" && (
              <p className="text-[11px] text-muted mt-1">
                CIC owns the daily roster for this class. The chosen section&rsquo;s
                Class-in-Charge will be set to this user.
              </p>
            )}
          </div>
        )}

        {/* Faculty-specific */}
        {showEmployeeId && (
          <input
            placeholder="Employee ID * (e.g. FAC-ENG-118)"
            value={form.employee_id ?? ""}
            onChange={(e) => update("employee_id", e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
            required
          />
        )}

        {/* Student-specific */}
        {showStudentFields && (
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Enrollment no. * (e.g. ENG/CSE/2025/0042)"
              value={form.enrollment_no ?? ""}
              onChange={(e) => update("enrollment_no", e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            />
            <input
              type="number"
              placeholder="Admitted year *"
              value={form.admitted_year ?? ""}
              onChange={(e) =>
                update("admitted_year", parseInt(e.target.value) || undefined)
              }
              className="px-3 py-2 rounded-xl bg-white/60 border border-white/70 text-sm"
              required
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={form.provision ?? true}
            onChange={(e) => update("provision", e.target.checked)}
          />
          Generate password and create login now (recommended). When unchecked
          the user is added but you must onboard them later from the pending list.
        </label>

        {error && <p className="text-bad text-xs">{error}</p>}

        <div className="flex gap-2 justify-end pt-2 border-t border-white/70">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create user"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

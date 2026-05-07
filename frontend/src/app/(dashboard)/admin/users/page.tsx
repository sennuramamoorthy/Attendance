"use client";

/**
 * Admin · Users — single-user create + bulk onboarding.
 *
 * Two flows live here:
 *
 * 1. **Create user** (button → modal). Fields are role-conditional:
 *    - cic / student → must pick a section (class)
 *    - hod / faculty → department
 *    - dean → school
 *    - admin / registrar / vc / chancellor → no scope
 *    Submitting both creates the user + auth account in one call and reveals
 *    the generated password once.
 *
 * 2. **Bulk onboarding**. After a CSV upload, students/faculty exist in the
 *    DB but have no auth account. They show up here as "pending" — admin
 *    selects rows (or "Onboard all") and gets back a list of email/password
 *    pairs to share. Plaintext passwords are shown ONCE and never stored.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { adminApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import type {
  CreateUserResponse,
  Department,
  OnboardResponse,
  OnboardResultRow,
  PendingUser,
  Program,
  School,
  Section,
} from "@/lib/api/types";
import { CreateUserModal } from "@/components/admin/create-user-modal";
import { CredentialsReveal } from "@/components/admin/credentials-reveal";

export default function AdminUsersPage() {
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onboarding, setOnboarding] = useState(false);
  const [results, setResults] = useState<OnboardResultRow[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createdCredential, setCreatedCredential] =
    useState<CreateUserResponse | null>(null);
  const [error, setError] = useState("");

  const fetchAll = useCallback(() => {
    Promise.all([
      adminApi.listPendingUsers(),
      adminApi.listSchools(),
      adminApi.listDepartments(),
      adminApi.listPrograms(),
      adminApi.listSections(),
    ])
      .then(([p, s, d, pr, sec]) => {
        setPending(p);
        setSchools(s);
        setDepartments(d);
        setPrograms(pr);
        setSections(sec);
        setError("");
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const allSelected =
    pending.length > 0 && selected.size === pending.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pending.map((p) => p.user_id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onboardSelected(all = false) {
    setOnboarding(true);
    setError("");
    setResults(null);
    const body = all
      ? { onboard_all_pending: true }
      : { user_ids: Array.from(selected) };
    adminApi
      .onboardUsers(body)
      .then((data: OnboardResponse) => {
        setResults(data.results);
        setSelected(new Set());
        // Refresh pending list (provisioned users now drop off it).
        return adminApi.listPendingUsers().then(setPending);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Onboarding failed")
      )
      .finally(() => setOnboarding(false));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
            Admin &middot; Users
          </p>
          <h1 className="mt-1">User Onboarding</h1>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          + Add User
        </Button>
      </div>

      {error && (
        <GlassCard className="mb-4 border-l-4 border-l-bad">
          <p className="text-bad text-sm font-semibold">{error}</p>
        </GlassCard>
      )}

      {/* Created-user reveal (single create flow) */}
      {createdCredential && createdCredential.password && (
        <CredentialsReveal
          title={`Created · ${createdCredential.full_name}`}
          rows={[
            {
              email: createdCredential.email,
              full_name: createdCredential.full_name,
              password: createdCredential.password,
              status: "ok",
              error: null,
              user_id: createdCredential.user_id,
            },
          ]}
          onDismiss={() => setCreatedCredential(null)}
        />
      )}

      {/* Bulk onboarding results (multi-row) */}
      {results && results.length > 0 && (
        <CredentialsReveal
          title={`Onboarding results (${results.filter((r) => r.password).length} new logins)`}
          rows={results}
          onDismiss={() => setResults(null)}
        />
      )}

      <GlassCard className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="font-bold mb-1">Pending onboarding</h3>
            <p className="text-xs text-muted">
              These users were created (typically via CSV bulk upload) but
              don&rsquo;t have an auth login yet. Onboarding generates a random
              8&ndash;10 character password and creates their Supabase auth
              account &mdash; passwords are revealed once and never stored.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => onboardSelected(false)}
              disabled={selected.size === 0 || onboarding}
            >
              {onboarding ? "Onboarding..." : `Onboard selected (${selected.size})`}
            </Button>
            <Button
              variant="primary"
              onClick={() => onboardSelected(true)}
              disabled={pending.length === 0 || onboarding}
            >
              Onboard all
            </Button>
          </div>
        </div>
      </GlassCard>

      {loading ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">Loading...</p>
        </GlassCard>
      ) : pending.length === 0 ? (
        <GlassCard className="text-center py-8">
          <p className="text-muted">
            No pending users. All onboarded — bulk upload students/faculty to
            see them here, or use <strong>+ Add User</strong> to create one.
          </p>
        </GlassCard>
      ) : (
        <GlassCard padding="none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    Scope
                  </th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr
                    key={p.user_id}
                    className="hover:bg-white/40 transition-colors cursor-pointer"
                    onClick={() => toggleOne(p.user_id)}
                  >
                    <td className="px-4 py-3 border-t border-[var(--line-2)]">
                      <input
                        type="checkbox"
                        checked={selected.has(p.user_id)}
                        onChange={() => toggleOne(p.user_id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-mono text-xs">
                      {p.email}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] font-semibold">
                      {p.full_name}
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] uppercase text-[10.5px] tracking-wide">
                      <Pill variant="default">{p.role}</Pill>
                    </td>
                    <td className="px-4 py-3 border-t border-[var(--line-2)] text-muted">
                      {p.entity_label ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {showCreate && (
        <CreateUserModal
          schools={schools}
          departments={departments}
          programs={programs}
          sections={sections}
          onClose={() => setShowCreate(false)}
          onCreated={(resp) => {
            setShowCreate(false);
            if (resp.password) setCreatedCredential(resp);
            fetchAll();
          }}
        />
      )}
    </div>
  );
}

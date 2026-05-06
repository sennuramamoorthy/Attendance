"use client";

/**
 * One-time credential reveal.
 *
 * Plaintext passwords are returned by the backend exactly once at provisioning
 * time and never stored. This component shows them with copy-to-clipboard +
 * "Copy all as CSV" + an explicit dismiss step so admins are reminded not to
 * navigate away before capturing what they need.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import type { OnboardResultRow } from "@/lib/api/types";

interface Props {
  title: string;
  rows: OnboardResultRow[];
  onDismiss: () => void;
}

export function CredentialsReveal({ title, rows, onDismiss }: Props) {
  const withPasswords = rows.filter((r) => r.password);
  const errors = rows.filter((r) => r.status === "error");

  function copyAll() {
    const lines = ["email,password,name", ...withPasswords.map((r) =>
      `${r.email},${r.password},${r.full_name}`
    )];
    navigator.clipboard.writeText(lines.join("\n"));
  }

  function downloadCsv() {
    const lines = ["email,password,name", ...withPasswords.map((r) =>
      `"${r.email}","${r.password}","${r.full_name.replace(/"/g, '""')}"`
    )];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <GlassCard className="mb-6 border-l-4 border-l-amber">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="text-xs text-amber font-semibold mt-1">
            ⚠ Capture these passwords now — they are not stored and cannot be
            shown again. Share securely with each user.
          </p>
        </div>
        <div className="flex gap-2">
          {withPasswords.length > 0 && (
            <>
              <Button onClick={copyAll}>Copy CSV</Button>
              <Button onClick={downloadCsv}>↓ Download</Button>
            </>
          )}
          <Button variant="primary" onClick={onDismiss}>
            Done
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                Email
              </th>
              <th className="text-left px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                Name
              </th>
              <th className="text-left px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                Password
              </th>
              <th className="text-left px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td className="px-3 py-2 border-t border-[var(--line-2)] font-mono text-xs">
                  {r.email}
                </td>
                <td className="px-3 py-2 border-t border-[var(--line-2)]">
                  {r.full_name}
                </td>
                <td className="px-3 py-2 border-t border-[var(--line-2)] font-mono text-xs">
                  {r.password ? <PasswordCell value={r.password} /> : "—"}
                </td>
                <td className="px-3 py-2 border-t border-[var(--line-2)]">
                  {r.status === "ok" && <Pill variant="done">new login</Pill>}
                  {r.status === "already_provisioned" && (
                    <Pill variant="default">already onboarded</Pill>
                  )}
                  {r.status === "error" && (
                    <span className="text-bad text-xs">{r.error ?? "error"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {errors.length > 0 && (
        <p className="text-xs text-bad mt-3">
          {errors.length} user{errors.length === 1 ? "" : "s"} could not be
          onboarded — check the error column above and retry.
        </p>
      )}
    </GlassCard>
  );
}

function PasswordCell({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-2 hover:text-accent cursor-pointer"
      title="Click to copy"
    >
      <code>{value}</code>
      <span className="text-[10px] text-muted">
        {copied ? "✓ copied" : "copy"}
      </span>
    </button>
  );
}

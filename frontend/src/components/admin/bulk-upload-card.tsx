"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";
import type { BulkUploadResult } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";

export type UploadType =
  | "schools"
  | "departments"
  | "programs"
  | "sections"
  | "faculty"
  | "subjects"
  | "students"
  | "assignments";

interface BulkUploadCardProps {
  type: UploadType;
  columns: string[];
  notes?: string;
  onUploaded?: () => void;
}

export function BulkUploadCard({ type, columns, notes, onUploaded }: BulkUploadCardProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  function handleDownload() {
    setDownloading(true);
    adminApi
      .downloadTemplate(type)
      .catch((err) => alert(err instanceof Error ? err.message : "Download failed"))
      .finally(() => setDownloading(false));
  }

  function handleUpload() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    adminApi
      .bulkUpload(file, type)
      .then((data) => {
        setResult(data);
        if (data.success > 0) {
          if (onUploaded) onUploaded();
          else router.refresh();
        }
      })
      .catch((err) =>
        setResult({
          total: 0,
          success: 0,
          failed: 1,
          errors: [err instanceof ApiError ? err.message : "Upload failed"],
        })
      )
      .finally(() => setUploading(false));
  }

  return (
    <GlassCard className="mb-6">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-bold mb-1">Bulk upload</h3>
          <p className="text-xs text-muted">
            Columns: {columns.map((c) => (
              <code key={c} className="font-mono bg-white/60 px-1 mx-0.5 rounded text-[11px]">
                {c}
              </code>
            ))}
          </p>
          {notes && <p className="text-xs text-muted mt-1.5">{notes}</p>}
        </div>
        <Button onClick={handleDownload} disabled={downloading}>
          {downloading ? "..." : "↓ Template"}
        </Button>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm flex-1"
        />
        <Button variant="primary" onClick={handleUpload} disabled={!file || uploading}>
          {uploading ? "Uploading..." : "Upload CSV"}
        </Button>
      </div>

      {result && (
        <div className="mt-4 p-3 rounded-xl bg-white/60 border border-white/70">
          <div className="flex gap-6 text-sm">
            <span>
              Total: <strong>{result.total}</strong>
            </span>
            <span className="text-good">
              ✓ Success: <strong>{result.success}</strong>
            </span>
            {result.failed > 0 && (
              <span className="text-bad">
                ✕ Failed: <strong>{result.failed}</strong>
              </span>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-bad font-mono">
                  {err}
                </p>
              ))}
            </div>
          )}
          {result.success > 0 && (type === "students" || type === "faculty") && (
            // Bulk upload only creates DB rows — no auth account exists yet, so
            // these users can't log in. Nudge admin to the onboarding flow.
            <div className="mt-3 pt-3 border-t border-white/70 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                <strong>Next step:</strong> generate login passwords so the
                new {type} can sign in.
              </p>
              <Link href="/admin/users">
                <Button variant="primary">→ Onboard logins</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}

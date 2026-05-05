"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadFile } from "@/lib/api";

interface DownloadCsvButtonProps {
  path: string;
  filename: string;
  label?: string;
}

export function DownloadCsvButton({ path, filename, label = "↓ Export CSV" }: DownloadCsvButtonProps) {
  const [busy, setBusy] = useState(false);

  function handleClick() {
    setBusy(true);
    downloadFile(path, filename)
      .catch((err) => alert(err instanceof Error ? err.message : "Download failed"))
      .finally(() => setBusy(false));
  }

  return (
    <Button onClick={handleClick} disabled={busy}>
      {busy ? "..." : label}
    </Button>
  );
}

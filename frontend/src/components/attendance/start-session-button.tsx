"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { attendanceApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";

interface StartSessionButtonProps {
  assignmentId: string;
  scheduleId: string;
}

export function StartSessionButton({
  assignmentId,
  scheduleId,
}: StartSessionButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function startSession() {
    setLoading(true);

    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
      });
    }).catch(() => null);

    if (!pos) {
      alert("Location is required to start a session. Enable GPS.");
      setLoading(false);
      return;
    }

    try {
      const { session_id, secret } = await attendanceApi.startSession({
        subject_assignment_id: assignmentId,
        class_schedule_id: scheduleId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      sessionStorage.setItem(`session-${session_id}-secret`, secret);
      router.push(`/faculty/session/${session_id}`);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to start session");
      setLoading(false);
    }
  }

  return (
    <Button
      variant="primary"
      onClick={startSession}
      disabled={loading}
      className="text-xs px-3 py-1.5"
    >
      {loading ? "..." : "Open QR"}
    </Button>
  );
}

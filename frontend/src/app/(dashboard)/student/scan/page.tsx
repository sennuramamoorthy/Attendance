"use client";

import { useState, useEffect, useRef } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { attendanceApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";

type ScanState = "ready" | "scanning" | "success" | "error";

export default function StudentScanPage() {
  const [state, setState] = useState<ScanState>("ready");
  const [error, setError] = useState("");
  const [geoStatus, setGeoStatus] = useState<string>("Getting location...");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("Location acquired");
      },
      () => {
        setGeoStatus("Location denied - attendance may fail");
      },
      { enableHighAccuracy: true }
    );
  }, []);

  async function startScanning() {
    setState("scanning");
    setError("");

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await scanner.stop();
          scannerRef.current = null;
          await submitAttendance(decodedText);
        },
        () => {}
      );
    } catch {
      setState("error");
      setError("Camera access denied. Enable camera permissions.");
    }
  }

  async function submitAttendance(token: string) {
    if (!location) {
      setState("error");
      setError("Location not available. Enable location services.");
      return;
    }

    const FingerprintJS = await import("@fingerprintjs/fingerprintjs");
    const fp = await FingerprintJS.load();
    const result = await fp.get();

    try {
      await attendanceApi.mark({
        token,
        lat: location.lat,
        lng: location.lng,
        device_fingerprint: result.visitorId,
      });
      setState("success");
    } catch (err) {
      setState("error");
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to mark attendance");
      }
    }
  }

  function reset() {
    setState("ready");
    setError("");
  }

  useEffect(() => {
    return () => {
      scannerRef.current?.stop();
    };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Mark Attendance
        </p>
        <h1 className="mt-1">Scan QR Code</h1>
      </div>

      <div className="max-w-md mx-auto">
        <GlassCard className="text-center">
          {state === "ready" && (
            <div className="py-8">
              <div className="w-24 h-24 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-accent/12 to-accent-2/12 border border-white/60 grid place-items-center">
                <span className="text-4xl">📷</span>
              </div>
              <p className="text-muted text-sm mb-2">
                Point your camera at the QR code displayed by your faculty
              </p>
              <p className="text-xs text-muted font-mono">{geoStatus}</p>
              <Button variant="primary" onClick={startScanning} className="mt-6">
                Start Scanning
              </Button>
            </div>
          )}

          {state === "scanning" && (
            <div>
              <div
                id="qr-reader"
                className="rounded-2xl overflow-hidden bg-ink/95"
                style={{ width: "100%", minHeight: "300px" }}
              />
              <p className="text-xs text-muted mt-3">Center QR code in the frame</p>
              <Button
                onClick={async () => {
                  await scannerRef.current?.stop();
                  scannerRef.current = null;
                  setState("ready");
                }}
                className="mt-3"
              >
                Cancel
              </Button>
            </div>
          )}

          {state === "success" && (
            <div className="py-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-good/20 grid place-items-center">
                <span className="text-4xl text-good">✓</span>
              </div>
              <h2 className="text-good">Attendance Marked!</h2>
              <p className="text-sm text-muted mt-2">
                You have been marked present for this class.
              </p>
            </div>
          )}

          {state === "error" && (
            <div className="py-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-bad/20 grid place-items-center">
                <span className="text-4xl text-bad">✕</span>
              </div>
              <h2 className="text-bad">Failed</h2>
              <p className="text-sm text-muted mt-2">{error}</p>
              <Button onClick={reset} className="mt-4">
                Try Again
              </Button>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

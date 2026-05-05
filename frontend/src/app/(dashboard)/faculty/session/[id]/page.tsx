"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import Image from "next/image";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { attendanceApi } from "@/lib/api";

export default function FacultySessionPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [presentCount, setPresentCount] = useState(0);
  const [sessionActive, setSessionActive] = useState(true);
  const [secret] = useState(() =>
    typeof window === "undefined"
      ? ""
      : sessionStorage.getItem(`session-${sessionId}-secret`) ?? ""
  );
  const [rotationIndex, setRotationIndex] = useState(0);

  const generateQr = useCallback(() => {
    if (!secret) return;
    attendanceApi
      .getQrToken({ session_id: sessionId, secret, rotation_index: rotationIndex })
      .then(({ token }) =>
        QRCode.toDataURL(token, {
          width: 280,
          margin: 2,
          color: { dark: "#1a1d3a", light: "#ffffff" },
        })
      )
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
        setCountdown(60);
        setRotationIndex((prev) => prev + 1);
      })
      .catch((err) => console.error("Failed to refresh QR:", err));
  }, [sessionId, secret, rotationIndex]);

  useEffect(() => {
    if (!secret || !sessionActive) return;
    generateQr();
    const interval = setInterval(generateQr, 60000);
    return () => clearInterval(interval);
  }, [secret, sessionActive, generateQr]);

  useEffect(() => {
    if (!sessionActive) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 60 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionActive]);

  useEffect(() => {
    if (!sessionActive) return;
    const interval = setInterval(async () => {
      try {
        const { count } = await attendanceApi.getSessionCount(sessionId);
        setPresentCount(count);
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionId, sessionActive]);

  async function closeSession() {
    try {
      await attendanceApi.closeSession(sessionId);
    } finally {
      setSessionActive(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
          Live Session
        </p>
        <h1 className="mt-1">QR Attendance</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        <GlassCard className="text-center">
          {sessionActive ? (
            <>
              <div className="bg-gradient-to-br from-accent/12 to-accent-2/12 rounded-3xl border border-white/60 p-6 inline-block">
                {qrDataUrl ? (
                  <Image
                    src={qrDataUrl}
                    alt="QR Code"
                    width={220}
                    height={220}
                    unoptimized
                    className="rounded-2xl shadow-[0_14px_40px_rgba(109,76,255,0.2)]"
                  />
                ) : (
                  <div className="w-[220px] h-[220px] bg-white/50 rounded-2xl animate-pulse" />
                )}
              </div>
              <div className="mt-4 text-[30px] font-extrabold bg-gradient-to-br from-accent to-pink bg-clip-text text-transparent">
                00:{countdown.toString().padStart(2, "0")}
              </div>
              <p className="text-xs text-muted mt-1">Token rotates every 60s</p>
              <div className="flex gap-2 mt-4 justify-center">
                <Button onClick={generateQr}>Regenerate</Button>
                <Button variant="dark" onClick={closeSession}>
                  Close
                </Button>
              </div>
            </>
          ) : (
            <div className="py-12">
              <div className="text-4xl mb-2">Session Closed</div>
              <p className="text-muted">
                Attendance has been recorded for this class.
              </p>
            </div>
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                Present
              </span>
              <span className="text-3xl font-extrabold text-accent">
                {presentCount}
              </span>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                Status
              </span>
              <span
                className={`text-sm font-semibold ${sessionActive ? "text-good" : "text-muted"}`}
              >
                {sessionActive ? "Active" : "Closed"}
              </span>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

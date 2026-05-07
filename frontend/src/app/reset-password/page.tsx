"use client";

/**
 * Forced first-login password reset.
 *
 * The user lands here when /api/me reports `password_reset_required: true`
 * — i.e. their current password is the temp the admin typed in. They can't
 * use the rest of the app until they pick a new one.
 *
 * Flow:
 *   1. Validate the new password client-side (length, confirmation match).
 *   2. supabase.auth.updateUser({ password }) updates the credential in
 *      gotrue. The session JWT stays valid (no re-login needed).
 *   3. POST /api/me/clear-password-reset flips our backend flag so the
 *      next /api/me call lets the dashboard render normally.
 *   4. Hard navigation to "/" so the dashboard layout's redirect chain
 *      runs fresh against the new flag value.
 *
 * The page lives OUTSIDE the (dashboard) route group so the layout's
 * unconditional redirect-when-flag-set doesn't loop.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { api, ApiError } from "@/lib/api/client";
import { createClient } from "@/lib/auth/supabase-client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Surface the user's email so they can confirm whose password they're
  // changing — also catches the "stale tab after sign-out" failure mode.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data, error: err }) => {
        if (err || !data.user) {
          // No session — nothing to update. Bounce to login.
          router.replace("/login");
          return;
        }
        setEmail(data.user.email ?? "");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Mirror the backend's 8-char minimum. gotrue itself accepts 6+ but
    // we'd rather not encourage that.
    if (pw1.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (pw1 !== pw2) {
      setError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    supabase.auth
      .updateUser({ password: pw1 })
      .then(({ error: err }) => {
        if (err) throw err;
        return api.post<{ success: boolean }>("/api/me/clear-password-reset");
      })
      .then(() => {
        // Hard nav so the layout's `/api/me` runs fresh and the redirect
        // chain proceeds to the user's role-appropriate landing.
        window.location.assign("/");
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Couldn't update password — try again"
        )
      )
      .finally(() => setSubmitting(false));
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent-2 grid place-items-center text-white text-2xl font-extrabold mx-auto shadow-[0_8px_22px_rgba(109,76,255,0.35)]">
            🔐
          </div>
          <h1 className="mt-4 text-xl font-bold">Set a new password</h1>
          <p className="text-muted text-xs mt-2">
            An admin set a temporary password for you. Pick a new one to
            finish setting up your account.
          </p>
        </div>

        <GlassCard>
          <form onSubmit={handleSubmit} className="space-y-4">
            {email && (
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">
                Account: <span className="font-mono normal-case tracking-normal text-ink-2">{email}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                New password
              </label>
              <input
                type="password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/60 border border-white/70 backdrop-blur-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="At least 8 characters"
                autoFocus
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Confirm new password
              </label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/60 border border-white/70 backdrop-blur-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="Type it again"
                required
                minLength={8}
              />
            </div>

            {error && <p className="text-bad text-xs font-medium">{error}</p>}

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={submitting}
            >
              {submitting ? "Updating..." : "Set new password"}
            </Button>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}

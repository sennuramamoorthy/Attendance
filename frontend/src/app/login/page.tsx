"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/auth/supabase-client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/student");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent-2 grid place-items-center text-white text-2xl font-extrabold mx-auto shadow-[0_8px_22px_rgba(109,76,255,0.35)]">
            T
          </div>
          <h1 className="mt-4 text-xl font-bold">Takshashila University</h1>
          <p className="text-muted text-xs font-mono uppercase tracking-[0.16em] mt-1">
            Attendance System
          </p>
        </div>

        <GlassCard>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/60 border border-white/70 backdrop-blur-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="you@takshashila.edu"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/60 border border-white/70 backdrop-blur-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <p className="text-bad text-xs font-medium">{error}</p>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type Role, ROLE_LABELS, ROLE_ROUTES } from "@/lib/auth/permissions";
import { createClient } from "@/lib/auth/supabase-client";
import { ThemeSettingsModal } from "@/components/theme/theme-settings";

interface TopbarProps {
  userName: string;
  email: string;
  roles: Role[];
}

const REPORTS_ROLES: ReadonlySet<Role> = new Set([
  "admin",
  "registrar",
  "vc",
  "chancellor",
  "dean",
  "hod",
]);

export function Topbar({ userName, email, roles }: TopbarProps) {
  const pathname = usePathname();

  function isActiveRole(role: Role): boolean {
    return pathname.startsWith(ROLE_ROUTES[role]);
  }

  const showReports = roles.some((r) => REPORTS_ROLES.has(r));
  const reportsActive = pathname.startsWith("/reports");

  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    supabase.auth
      .signOut()
      .catch((err) => console.error("sign-out failed:", err))
      .finally(() => {
        // Hard navigation so the next request leaves with no session cookie.
        window.location.assign("/login");
      });
  }

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-[20px] bg-white/45 border-b border-white/60">
      <div className="flex items-center gap-4 px-6 py-3.5 max-w-[1480px] mx-auto">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-2 grid place-items-center text-white font-extrabold text-sm shadow-[0_8px_22px_rgba(109,76,255,0.35)]">
            T
          </div>
          <div>
            <div className="font-bold text-[15px]">Takshashila</div>
            <div className="text-[11px] text-muted">Attendance</div>
          </div>
        </Link>

        <nav className="flex gap-1 ml-auto bg-white/55 border border-white/70 p-1 rounded-full backdrop-blur-[10px]">
          {roles.map((role) => (
            <Link
              key={role}
              href={ROLE_ROUTES[role]}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                isActiveRole(role) && !reportsActive
                  ? "bg-gradient-to-br from-accent to-accent-2 text-white shadow-[0_6px_18px_rgba(109,76,255,0.3)]"
                  : "text-ink-2 hover:bg-white/60"
              }`}
            >
              {ROLE_LABELS[role]}
            </Link>
          ))}
          {showReports && (
            <Link
              href="/reports"
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                reportsActive
                  ? "bg-gradient-to-br from-accent to-accent-2 text-white shadow-[0_6px_18px_rgba(109,76,255,0.3)]"
                  : "text-ink-2 hover:bg-white/60"
              }`}
            >
              Reports
            </Link>
          )}
        </nav>

        <div ref={menuRef} className="relative ml-4">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-pink grid place-items-center text-white text-[11px] font-bold cursor-pointer hover:shadow-[0_4px_14px_rgba(109,76,255,0.3)] transition-shadow"
            aria-label="User menu"
          >
            {initials}
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white/85 border border-white/70 backdrop-blur-[20px] shadow-[0_14px_40px_rgba(28,32,82,0.12)] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/70">
                <div className="text-sm font-semibold text-ink truncate">
                  {userName}
                </div>
                <div className="text-[11px] text-muted truncate">{email}</div>
                {roles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {roles.map((r) => (
                      <span
                        key={r}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/12 text-accent border border-accent/20"
                      >
                        {ROLE_LABELS[r]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setThemeOpen(true);
                  setMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-ink-2 hover:bg-white/60 cursor-pointer border-b border-white/70"
              >
                🎨 Theme
              </button>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-ink-2 hover:bg-white/60 cursor-pointer disabled:opacity-50"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </div>

      <ThemeSettingsModal open={themeOpen} onClose={() => setThemeOpen(false)} />
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Role, ROLE_LABELS, ROLE_ROUTES } from "@/lib/auth/permissions";

interface TopbarProps {
  userName: string;
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

export function Topbar({ userName, roles }: TopbarProps) {
  const pathname = usePathname();

  function isActiveRole(role: Role): boolean {
    return pathname.startsWith(ROLE_ROUTES[role]);
  }

  const showReports = roles.some((r) => REPORTS_ROLES.has(r));
  const reportsActive = pathname.startsWith("/reports");

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

        <div className="flex items-center gap-2 ml-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-pink grid place-items-center text-white text-[11px] font-bold">
            {userName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)}
          </div>
        </div>
      </div>
    </header>
  );
}

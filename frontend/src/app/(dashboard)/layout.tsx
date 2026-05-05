import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { Topbar } from "@/components/layout/topbar";
import type { Role } from "@/lib/auth/permissions";

interface MeResponse {
  id: string;
  email: string;
  full_name: string | null;
  roles: Role[];
}

type FetchResult =
  | { kind: "ok"; me: MeResponse }
  | { kind: "rejected" }
  | { kind: "error"; status: number }
  | { kind: "unreachable" };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

async function fetchMe(token: string): Promise<FetchResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/me`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401 || response.status === 403) {
      return { kind: "rejected" };
    }
    if (!response.ok) {
      return { kind: "error", status: response.status };
    }
    return { kind: "ok", me: await response.json() };
  } catch {
    return { kind: "unreachable" };
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const result = await fetchMe(session.access_token);

  if (result.kind === "rejected") {
    // Backend rejected the JWT. Clear session before redirecting so the
    // middleware doesn't bounce us right back here.
    await supabase.auth.signOut();
    redirect("/login");
  }

  if (result.kind === "unreachable") {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-bad mb-3">Backend unreachable</h1>
          <p className="text-muted text-sm mb-4">
            The API server isn&apos;t responding at <code className="font-mono">{API_BASE_URL}</code>.
          </p>
          <p className="text-muted text-xs font-mono bg-white/60 border border-white/70 rounded-xl p-3 inline-block">
            make dev-backend
          </p>
        </div>
      </div>
    );
  }

  if (result.kind === "error") {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-bad mb-3">Backend error</h1>
          <p className="text-muted text-sm">
            The API returned status {result.status}. Try again or check the backend logs.
          </p>
        </div>
      </div>
    );
  }

  const me = result.me;

  return (
    <div className="min-h-screen">
      <Topbar
        userName={me.full_name ?? me.email ?? "User"}
        roles={me.roles}
      />
      <main className="max-w-[1480px] mx-auto px-6 py-8 pb-20">
        {children}
      </main>
    </div>
  );
}

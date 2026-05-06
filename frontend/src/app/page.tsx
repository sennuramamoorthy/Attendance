import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { defaultRouteFor, type Role } from "@/lib/auth/permissions";

const API_BASE_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8001";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  // Route by role — without this, every user lands on /student which only
  // renders correctly for students. Non-students see "profile not found".
  let roles: Role[] = [];
  try {
    const response = await fetch(`${API_BASE_URL}/api/me`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (response.ok) {
      const me = (await response.json()) as { roles: Role[] };
      roles = me.roles ?? [];
    }
  } catch {
    // Network error → fall back to /login so middleware can re-evaluate.
    redirect("/login");
  }

  redirect(defaultRouteFor(roles));
}

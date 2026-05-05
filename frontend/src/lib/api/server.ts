import { createServerSupabaseClient } from "@/lib/auth/supabase-server";

// Inside Docker, server-side fetches need the in-network URL (e.g. `http://backend:8001`).
// In local dev, falls back to the browser-facing URL.
const API_BASE_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8001";

export async function serverApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers,
      },
    });
  } catch (err) {
    console.error(`[serverApi] fetch failed: ${API_BASE_URL}${path}`, err);
    return null;
  }

  if (!response.ok) {
    // Log so the cause of a "not found" UI is recoverable from logs.
    console.error(
      `[serverApi] ${response.status} ${response.statusText} for ${path}`
    );
    return null;
  }
  return response.json();
}

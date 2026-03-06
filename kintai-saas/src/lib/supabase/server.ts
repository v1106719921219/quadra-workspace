import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getTenantIdOrNull } from "@/lib/tenant";

export async function createClient() {
  const cookieStore = await cookies();
  const tenantId = await getTenantIdOrNull();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component can't set cookies
          }
        },
      },
      global: {
        headers: tenantId ? { "x-tenant-id": tenantId } : {},
      },
    }
  );

  return supabase;
}

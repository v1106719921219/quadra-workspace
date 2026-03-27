import { headers } from "next/headers";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
export { extractSubdomain } from "@/lib/subdomain";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
}

export const resolveTenant = cache(async (): Promise<Tenant | null> => {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  const { extractSubdomain } = await import("@/lib/subdomain");
  const slug = extractSubdomain(host);
  if (!slug) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("id, slug, name")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    console.warn(`[tenant] slug "${slug}" のテナントが見つかりません (host: ${host})`);
    return null;
  }

  return data as Tenant;
});

export const getTenantId = cache(async (): Promise<string> => {
  const tenant = await resolveTenant();
  if (!tenant) {
    throw new Error("テナントが特定できません");
  }
  return tenant.id;
});

export const getTenantIdOrNull = cache(async (): Promise<string | null> => {
  const tenant = await resolveTenant();
  return tenant?.id ?? null;
});

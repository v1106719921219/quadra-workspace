import { getTenantId } from "@/lib/tenant";

export async function tenantField(): Promise<{ tenant_id: string }> {
  const tenantId = await getTenantId();
  return { tenant_id: tenantId };
}

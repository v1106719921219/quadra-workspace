import { resolveTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { DocumentsClient } from "./documents-client";

export default async function DocumentsPage() {
  const tenant = await resolveTenant();
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("company_address, company_phone")
    .eq("tenant_id", tenant?.id ?? "")
    .single();

  return (
    <DocumentsClient
      orgName={tenant?.name || ""}
      companyAddress={settings?.company_address || ""}
      companyPhone={settings?.company_phone || ""}
    />
  );
}

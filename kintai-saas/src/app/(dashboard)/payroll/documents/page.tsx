import { resolveTenant } from "@/lib/tenant";
import { DocumentsClient } from "./documents-client";

export default async function DocumentsPage() {
  const tenant = await resolveTenant();
  return <DocumentsClient orgName={tenant?.name || ""} />;
}

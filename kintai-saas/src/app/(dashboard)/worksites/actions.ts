"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function getWorksites() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_sites")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createWorksite(formData: FormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const name = formData.get("name") as string;
  const shortName = formData.get("short_name") as string;
  const sortOrder = parseInt(formData.get("sort_order") as string) || 0;

  const { error } = await supabase.from("job_sites").insert({
    tenant_id: tenantId,
    name,
    short_name: shortName || null,
    sort_order: sortOrder,
  });

  if (error) throw error;
  revalidatePath("/worksites");
}

export async function updateWorksite(id: string, formData: FormData) {
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const shortName = formData.get("short_name") as string;
  const sortOrder = parseInt(formData.get("sort_order") as string) || 0;
  const isActive = formData.get("is_active") === "true";

  const { error } = await supabase
    .from("job_sites")
    .update({ name, short_name: shortName || null, sort_order: sortOrder, is_active: isActive })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/worksites");
}

export async function deleteWorksite(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("job_sites").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/worksites");
}

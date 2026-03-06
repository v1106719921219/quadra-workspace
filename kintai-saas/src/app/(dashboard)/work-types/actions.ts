"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function getWorkTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_types")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createWorkType(formData: FormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const name = formData.get("name") as string;
  const dailyAllowance = parseInt(formData.get("daily_allowance") as string) || 0;
  const sortOrder = parseInt(formData.get("sort_order") as string) || 0;

  const { error } = await supabase.from("work_types").insert({
    tenant_id: tenantId,
    name,
    daily_allowance: dailyAllowance,
    sort_order: sortOrder,
  });

  if (error) throw error;
  revalidatePath("/work-types");
}

export async function updateWorkType(id: string, formData: FormData) {
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const dailyAllowance = parseInt(formData.get("daily_allowance") as string) || 0;
  const sortOrder = parseInt(formData.get("sort_order") as string) || 0;
  const isActive = formData.get("is_active") === "true";

  const { error } = await supabase
    .from("work_types")
    .update({ name, daily_allowance: dailyAllowance, sort_order: sortOrder, is_active: isActive })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/work-types");
}

export async function deleteWorkType(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("work_types").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/work-types");
}

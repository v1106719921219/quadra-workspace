"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function getTenantSettings() {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const { data } = await supabase
    .from("tenant_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  return data;
}

export async function updateTenantSettings(formData: FormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const closingDay = parseInt(formData.get("closing_day") as string) || 0;
  const timezone = formData.get("timezone") as string || "Asia/Tokyo";

  const { error } = await supabase
    .from("tenant_settings")
    .update({ closing_day: closingDay, timezone })
    .eq("tenant_id", tenantId);

  if (error) throw error;
  revalidatePath("/settings");
}

export async function getOrganizationMembers() {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const { data } = await supabase
    .from("organization_members")
    .select("id, role, user_id, profiles(email, full_name)")
    .eq("organization_id", tenantId)
    .order("created_at");

  return data || [];
}

export async function updateMemberRole(memberId: string, role: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", memberId);

  if (error) throw error;
  revalidatePath("/settings");
}

export async function removeMember(memberId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId);

  if (error) throw error;
  revalidatePath("/settings");
}

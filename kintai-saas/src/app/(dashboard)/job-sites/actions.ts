"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function getJobSites() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_sites")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createJobSite(formData: FormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const hourlyRateStr = formData.get("hourly_rate") as string;
  const dailyAllowanceStr = formData.get("daily_allowance") as string;

  const { error } = await supabase.from("job_sites").insert({
    tenant_id: tenantId,
    name: formData.get("name") as string,
    short_name: (formData.get("short_name") as string) || null,
    address: (formData.get("address") as string) || null,
    client_name: (formData.get("client_name") as string) || null,
    note: (formData.get("note") as string) || null,
    color: (formData.get("color") as string) || "#3b82f6",
    sort_order: parseInt(formData.get("sort_order") as string) || 0,
    hourly_rate: hourlyRateStr ? parseInt(hourlyRateStr) : null,
    daily_allowance: dailyAllowanceStr ? parseInt(dailyAllowanceStr) : null,
  });

  if (error) throw error;
  revalidatePath("/job-sites");
}

export async function updateJobSite(id: string, formData: FormData) {
  const supabase = await createClient();

  const hourlyRateStr = formData.get("hourly_rate") as string;
  const dailyAllowanceStr = formData.get("daily_allowance") as string;

  const { error } = await supabase
    .from("job_sites")
    .update({
      name: formData.get("name") as string,
      short_name: (formData.get("short_name") as string) || null,
      address: (formData.get("address") as string) || null,
      client_name: (formData.get("client_name") as string) || null,
      note: (formData.get("note") as string) || null,
      color: (formData.get("color") as string) || "#3b82f6",
      sort_order: parseInt(formData.get("sort_order") as string) || 0,
      is_active: formData.get("is_active") === "true",
      hourly_rate: hourlyRateStr ? parseInt(hourlyRateStr) : null,
      daily_allowance: dailyAllowanceStr ? parseInt(dailyAllowanceStr) : null,
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/job-sites");
}

export async function deleteJobSite(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("job_sites").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/job-sites");
}

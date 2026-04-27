import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export type TenantRole = "owner" | "admin" | "manager" | "employee";

export async function getSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return profile as Profile;
}

export async function getTenantRole(): Promise<TenantRole | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const tenantId = await getTenantId();

  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();

  return (data?.role as TenantRole) ?? null;
}

export async function requireTenantAdmin(): Promise<Profile> {
  const profile = await getProfile();
  const role = await getTenantRole();

  if (!role || (role !== "owner" && role !== "admin")) {
    redirect("/dashboard");
  }

  return profile;
}

export async function requireTenantManager(): Promise<Profile> {
  const profile = await getProfile();
  const role = await getTenantRole();

  if (!role || !["owner", "admin", "manager"].includes(role)) {
    redirect("/dashboard");
  }

  return profile;
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function getEmployees() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createEmployee(formData: FormData) {
  const supabase = await createClient();
  const tenantId = await getTenantId();

  const name = formData.get("name") as string;
  const employeeNumber = formData.get("employee_number") as string;
  const employeeType = formData.get("employee_type") as string;
  const hourlyRate = formData.get("hourly_rate");
  const monthlySalary = formData.get("monthly_salary");

  const transportationAllowance = formData.get("transportation_allowance");
  const dependentsCount = formData.get("dependents_count");
  const taxColumn = formData.get("tax_column") as string;
  const socialInsuranceEnrolled = formData.get("social_insurance_enrolled") === "true";

  const { error } = await supabase.from("employees").insert({
    tenant_id: tenantId,
    name,
    employee_number: employeeNumber || null,
    employee_type: employeeType,
    hourly_rate: hourlyRate ? parseInt(hourlyRate as string) : null,
    monthly_salary: monthlySalary ? parseInt(monthlySalary as string) : null,
    transportation_allowance: transportationAllowance ? parseInt(transportationAllowance as string) : 0,
    dependents_count: dependentsCount ? parseInt(dependentsCount as string) : 0,
    tax_column: taxColumn || "kou",
    social_insurance_enrolled: socialInsuranceEnrolled,
  });

  if (error) throw error;
  revalidatePath("/employees");
}

export async function updateEmployee(id: string, formData: FormData) {
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const employeeNumber = formData.get("employee_number") as string;
  const employeeType = formData.get("employee_type") as string;
  const hourlyRate = formData.get("hourly_rate");
  const monthlySalary = formData.get("monthly_salary");
  const isActive = formData.get("is_active") === "true";

  const transportationAllowance = formData.get("transportation_allowance");
  const dependentsCount = formData.get("dependents_count");
  const taxColumn = formData.get("tax_column") as string;
  const socialInsuranceEnrolled = formData.get("social_insurance_enrolled") === "true";

  const { error } = await supabase
    .from("employees")
    .update({
      name,
      employee_number: employeeNumber || null,
      employee_type: employeeType,
      hourly_rate: hourlyRate ? parseInt(hourlyRate as string) : null,
      monthly_salary: monthlySalary ? parseInt(monthlySalary as string) : null,
      is_active: isActive,
      transportation_allowance: transportationAllowance ? parseInt(transportationAllowance as string) : 0,
      dependents_count: dependentsCount ? parseInt(dependentsCount as string) : 0,
      tax_column: taxColumn || "kou",
      social_insurance_enrolled: socialInsuranceEnrolled,
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/employees");
}

export async function deleteEmployee(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/employees");
}

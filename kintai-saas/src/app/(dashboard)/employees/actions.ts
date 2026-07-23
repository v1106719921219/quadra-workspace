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

function extractBankRosterFields(formData: FormData) {
  const str = (key: string) => {
    const v = formData.get(key) as string | null;
    return v?.trim() || null;
  };
  return {
    bank_name: str("bank_name"),
    bank_branch: str("bank_branch"),
    account_type: (formData.get("account_type") as string) || "ordinary",
    account_number: str("account_number"),
    account_holder: str("account_holder"),
    address: str("address"),
    birth_date: str("birth_date"),
    gender: str("gender"),
    hire_date: str("hire_date"),
    retire_date: str("retire_date"),
    job_description: str("job_description"),
  };
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
  const employmentInsuranceEnrolled = formData.get("employment_insurance_enrolled") === "true";
  const careInsuranceEnrolled = formData.get("care_insurance_enrolled") === "true";
  const standardMonthlyRemuneration = formData.get("standard_monthly_remuneration");
  const residentTax = formData.get("resident_tax");
  const savingsDeduction = formData.get("savings_deduction");
  const canBeDriver = formData.get("can_be_driver") === "true";
  const boardChar = formData.get("board_char") as string;
  const pin = formData.get("pin") as string;

  const { error } = await supabase.from("employees").insert({
    tenant_id: tenantId,
    ...extractBankRosterFields(formData),
    name,
    employee_number: employeeNumber || null,
    employee_type: employeeType,
    hourly_rate: hourlyRate ? parseInt(hourlyRate as string) : null,
    monthly_salary: monthlySalary ? parseInt(monthlySalary as string) : null,
    transportation_allowance: transportationAllowance ? parseInt(transportationAllowance as string) : 0,
    dependents_count: dependentsCount ? parseInt(dependentsCount as string) : 0,
    tax_column: taxColumn || "kou",
    social_insurance_enrolled: socialInsuranceEnrolled,
    employment_insurance_enrolled: employmentInsuranceEnrolled,
    care_insurance_enrolled: careInsuranceEnrolled,
    standard_monthly_remuneration: standardMonthlyRemuneration ? parseInt(standardMonthlyRemuneration as string) : 0,
    resident_tax: residentTax ? parseInt(residentTax as string) : 0,
    savings_deduction: savingsDeduction ? parseInt(savingsDeduction as string) : 0,
    can_be_driver: canBeDriver,
    board_char: boardChar?.trim().slice(0, 1) || null,
    pin: pin?.trim() || null,
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
  const employmentInsuranceEnrolled = formData.get("employment_insurance_enrolled") === "true";
  const careInsuranceEnrolled = formData.get("care_insurance_enrolled") === "true";
  const standardMonthlyRemuneration = formData.get("standard_monthly_remuneration");
  const residentTax = formData.get("resident_tax");
  const savingsDeduction = formData.get("savings_deduction");
  const canBeDriver = formData.get("can_be_driver") === "true";
  const boardChar = formData.get("board_char") as string;
  const pin = formData.get("pin") as string;

  const { error } = await supabase
    .from("employees")
    .update({
      ...extractBankRosterFields(formData),
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
      employment_insurance_enrolled: employmentInsuranceEnrolled,
      care_insurance_enrolled: careInsuranceEnrolled,
      standard_monthly_remuneration: standardMonthlyRemuneration ? parseInt(standardMonthlyRemuneration as string) : 0,
      resident_tax: residentTax ? parseInt(residentTax as string) : 0,
      savings_deduction: savingsDeduction ? parseInt(savingsDeduction as string) : 0,
      can_be_driver: canBeDriver,
      board_char: boardChar?.trim().slice(0, 1) || null,
      pin: pin?.trim() || null,
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/employees");
}

export async function toggleEmployeeActive(id: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ is_active: isActive })
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

// ===== 住民税の月別内訳 =====
// 年度（fiscalYear）= fiscalYear年6月 〜 fiscalYear+1年5月 の12ヶ月

export interface ResidentTaxMonth {
  year: number;
  month: number;
  amount: number;
}

function fiscalYearMonths(fiscalYear: number): { year: number; month: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = 6 + i;
    return m <= 12 ? { year: fiscalYear, month: m } : { year: fiscalYear + 1, month: m - 12 };
  });
}

export async function getResidentTaxSchedule(employeeId: string, fiscalYear: number): Promise<ResidentTaxMonth[]> {
  const supabase = await createClient();
  const months = fiscalYearMonths(fiscalYear);

  const { data, error } = await supabase
    .from("resident_tax_schedules")
    .select("year, month, amount")
    .eq("employee_id", employeeId)
    .or(`and(year.eq.${fiscalYear},month.gte.6),and(year.eq.${fiscalYear + 1},month.lte.5)`);

  if (error) throw error;

  const map = new Map<string, number>();
  for (const r of data || []) map.set(`${r.year}-${r.month}`, r.amount);

  return months.map((m) => ({ ...m, amount: map.get(`${m.year}-${m.month}`) ?? 0 }));
}

export async function saveResidentTaxSchedule(employeeId: string, fiscalYear: number, amounts: number[]) {
  if (amounts.length !== 12) throw new Error("12ヶ月分の金額が必要です");
  const supabase = await createClient();
  const tenantId = await getTenantId();
  const months = fiscalYearMonths(fiscalYear);

  const rows = months.map((m, i) => ({
    tenant_id: tenantId,
    employee_id: employeeId,
    year: m.year,
    month: m.month,
    amount: Math.max(0, Math.round(amounts[i] || 0)),
  }));

  const { error } = await supabase
    .from("resident_tax_schedules")
    .upsert(rows, { onConflict: "tenant_id,employee_id,year,month" });

  if (error) throw error;
  revalidatePath("/employees");
  revalidatePath("/payroll");
}

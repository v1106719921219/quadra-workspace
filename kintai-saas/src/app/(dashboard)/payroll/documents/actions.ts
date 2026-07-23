"use server";

import { createClient } from "@/lib/supabase/server";

const EMPLOYEE_SELECT =
  "name, employee_number, employee_type, is_active, bank_name, bank_branch, account_type, account_number, account_holder, dependents_count, tax_column, resident_tax_city, resident_tax_city_code, resident_tax_designation_number, resident_tax_addressee_number";

export async function getPayrollForMonth(year: number, month: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_records")
    .select(`*, employees(${EMPLOYEE_SELECT})`)
    .eq("year", year)
    .eq("month", month)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getPayrollForYear(year: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_records")
    .select(`*, employees(${EMPLOYEE_SELECT})`)
    .eq("year", year)
    .order("month", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getRoster() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, name, employee_number, employee_type, is_active, address, birth_date, gender, hire_date, retire_date, job_description"
    )
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

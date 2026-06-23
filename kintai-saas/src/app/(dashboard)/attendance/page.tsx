import { createClient } from "@/lib/supabase/server";
import { AttendanceClient } from "./attendance-client";

export default async function AttendancePage() {
  const supabase = await createClient();

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name")
    .eq("is_active", true)
    .order("created_at");

  const { data: workTypes } = await supabase
    .from("work_types")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");

  const { data: jobSites } = await supabase
    .from("job_sites")
    .select("id, name, short_name")
    .eq("is_active", true)
    .order("sort_order");

  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("time_rounding_minutes")
    .single();

  return (
    <AttendanceClient
      employees={employees || []}
      workTypes={workTypes || []}
      jobSites={jobSites || []}
      roundingMinutes={settings?.time_rounding_minutes ?? 15}
    />
  );
}

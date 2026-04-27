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

  return (
    <AttendanceClient
      employees={employees || []}
      workTypes={workTypes || []}
    />
  );
}

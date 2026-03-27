import { createClient } from "@/lib/supabase/server";
import { ShiftsClient } from "./shifts-client";

export default async function ShiftsPage() {
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

  const { data: shiftTemplates } = await supabase
    .from("shift_templates")
    .select("*, work_types(name)")
    .order("sort_order");

  return (
    <ShiftsClient
      employees={employees || []}
      workTypes={workTypes || []}
      shiftTemplates={shiftTemplates || []}
    />
  );
}

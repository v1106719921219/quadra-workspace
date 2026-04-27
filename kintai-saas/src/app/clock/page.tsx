import { getEmployeesWithStatus } from "./actions";
import { ClockClient } from "./clock-client";
import { resolveTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";

export default async function ClockPage() {
  const tenant = await resolveTenant();
  if (!tenant) {
    redirect("/");
  }

  const employees = await getEmployeesWithStatus();

  return (
    <ClockClient
      initialEmployees={employees}
      tenantName={tenant.name}
    />
  );
}

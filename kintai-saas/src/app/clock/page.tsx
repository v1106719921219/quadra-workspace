import { getEmployeesWithStatus, getActiveWorkTypes } from "./actions";
import { ClockClient } from "./clock-client";
import { resolveTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";

export default async function ClockPage() {
  const tenant = await resolveTenant();
  if (!tenant) {
    redirect("/");
  }

  const [employees, workTypes] = await Promise.all([
    getEmployeesWithStatus(),
    getActiveWorkTypes(),
  ]);

  return (
    <ClockClient
      initialEmployees={employees}
      initialWorkTypes={workTypes}
      tenantName={tenant.name}
    />
  );
}

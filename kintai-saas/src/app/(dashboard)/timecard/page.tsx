import { TimecardClient } from "./timecard-client";
import { getActiveEmployees, getTenantSettings } from "./actions";

export default async function TimecardPage() {
  const [employees, settings] = await Promise.all([
    getActiveEmployees(),
    getTenantSettings(),
  ]);

  return (
    <TimecardClient
      initialEmployees={employees}
      initialSettings={settings}
    />
  );
}

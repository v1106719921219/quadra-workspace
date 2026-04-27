import { getActiveEmployees } from "./actions";
import { StaffClient } from "./staff-client";

export default async function StaffPage() {
  const employees = await getActiveEmployees();
  return <StaffClient employees={employees} />;
}

import { getEmployees } from "./actions";
import { EmployeesClient } from "./employees-client";

export default async function EmployeesPage() {
  const employees = await getEmployees();
  return <EmployeesClient employees={employees} />;
}

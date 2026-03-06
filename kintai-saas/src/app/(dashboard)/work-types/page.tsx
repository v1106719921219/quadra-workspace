import { getWorkTypes } from "./actions";
import { WorkTypesClient } from "./work-types-client";

export default async function WorkTypesPage() {
  const workTypes = await getWorkTypes();
  return <WorkTypesClient workTypes={workTypes} />;
}

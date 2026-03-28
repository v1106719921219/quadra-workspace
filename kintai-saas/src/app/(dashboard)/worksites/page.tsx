import { getWorksites } from "./actions";
import { WorksitesClient } from "./worksites-client";

export default async function WorksitesPage() {
  const worksites = await getWorksites();
  return <WorksitesClient worksites={worksites} />;
}

import { getJobSites } from "./actions";
import { JobSitesClient } from "./job-sites-client";

export default async function JobSitesPage() {
  const jobSites = await getJobSites();
  return <JobSitesClient jobSites={jobSites} />;
}

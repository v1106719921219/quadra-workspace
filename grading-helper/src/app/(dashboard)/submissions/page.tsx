import { getSubmissions } from "@/actions/submissions";
import { SubmissionList } from "./submission-list";

export default async function SubmissionsPage() {
  const submissions = await getSubmissions();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">提出リスト</h1>
      <SubmissionList submissions={submissions} />
    </div>
  );
}

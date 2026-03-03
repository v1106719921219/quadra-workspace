import { getSubmission, getSubmissionItems } from "@/actions/submissions";
import { getPokemonNames, getGradingCompanies } from "@/actions/cards";
import { SubmissionDetail } from "./submission-detail";
import { notFound } from "next/navigation";

export default async function SubmissionDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;

  try {
    const [submission, items, pokemonNames, companies] = await Promise.all([
      getSubmission(params.id),
      getSubmissionItems(params.id),
      getPokemonNames(),
      getGradingCompanies(),
    ]);

    return (
      <SubmissionDetail
        submission={submission}
        items={items}
        pokemonNames={pokemonNames}
        companies={companies}
      />
    );
  } catch {
    notFound();
  }
}

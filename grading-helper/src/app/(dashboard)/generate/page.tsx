import { getPokemonNames, getGradingCompanies } from "@/actions/cards";
import { GenerateForm } from "./generate-form";

export default async function GeneratePage() {
  const [pokemonNames, companies] = await Promise.all([
    getPokemonNames(),
    getGradingCompanies(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">英語名生成</h1>
      <p className="text-muted-foreground">
        型番とカード名を入力すると、グレーディング提出用の英語名を自動生成します。
      </p>
      <GenerateForm pokemonNames={pokemonNames} companies={companies} />
    </div>
  );
}

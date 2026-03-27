import { getTcgGames } from "@/actions/cards";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  const games = await getTcgGames();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">カードインポート</h1>
      <p className="text-muted-foreground">
        CSVファイルまたはテキストからカードデータを一括インポートします。
      </p>
      <ImportForm games={games} />
    </div>
  );
}

import { getTcgdexSets } from "@/actions/cards";
import { SyncForm } from "./sync-form";

export default async function SyncPage() {
  const sets = await getTcgdexSets();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">TCGdex同期</h1>
      <p className="text-muted-foreground">
        TCGdex APIからポケモンカードの日本語名・型番を一括取得してDBに保存します。
      </p>
      <SyncForm sets={sets} />
    </div>
  );
}

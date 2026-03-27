import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, FileText, Sparkles, Award } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  // カード数取得
  const { count: cardCount } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true });

  // 提出リスト数取得
  const { count: submissionCount } = await supabase
    .from("submissions")
    .select("*", { count: "exact", head: true });

  // 作成中の提出リスト数
  const { count: draftCount } = await supabase
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("status", "draft");

  // ポケモン名数
  const { count: pokemonNameCount } = await supabase
    .from("pokemon_names")
    .select("*", { count: "exact", head: true });

  const stats = [
    {
      title: "登録カード数",
      value: cardCount ?? 0,
      icon: Database,
    },
    {
      title: "提出リスト数",
      value: submissionCount ?? 0,
      icon: FileText,
    },
    {
      title: "作成中",
      value: draftCount ?? 0,
      icon: Award,
    },
    {
      title: "ポケモン名辞書",
      value: pokemonNameCount ?? 0,
      icon: Sparkles,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stat.value.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { syncSetFromTcgdex } from "@/actions/cards";

interface Set {
  id: string;
  nameJa: string;
  nameEn: string;
  totalCards: number;
}

interface SyncFormProps {
  sets: Set[];
}

export function SyncForm({ sets }: SyncFormProps) {
  const [syncing, setSyncing] = useState<string | null>(null);
  const [synced, setSynced] = useState<Set<string>>(new Set());

  // SVシリーズのみ表示（日本語名あり）
  const svSets = sets
    .filter((s) => s.id.toUpperCase().startsWith("SV") && s.nameJa)
    .sort((a, b) => a.id.localeCompare(b.id));

  const handleSync = async (setId: string) => {
    setSyncing(setId);
    try {
      const result = await syncSetFromTcgdex(setId);
      toast.success(`${result.setName}: ${result.imported}件を取り込みました`);
      setSynced((prev) => new Set([...prev, setId]));
    } catch (error) {
      toast.error(`エラー: ${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    for (const set of svSets) {
      if (synced.has(set.id)) continue;
      setSyncing(set.id);
      try {
        const result = await syncSetFromTcgdex(set.id);
        toast.success(`${result.setName}: ${result.imported}件`);
        setSynced((prev) => new Set([...prev, set.id]));
      } catch {
        // continue
      }
    }
    setSyncing(null);
    toast.success("全セット同期完了");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleSyncAll} disabled={!!syncing} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          全セット一括同期
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {svSets.map((set) => (
          <Card key={set.id} className={synced.has(set.id) ? "border-green-500" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="font-mono text-muted-foreground">{set.id}</span>
                {synced.has(set.id) && (
                  <Badge variant="secondary" className="text-green-600">
                    <Check className="mr-1 h-3 w-3" />済み
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm font-medium">{set.nameJa || set.nameEn}</p>
              <p className="text-xs text-muted-foreground">{set.totalCards}枚</p>
            </CardHeader>
            <CardContent className="pt-0">
              {syncing === set.id ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  取得中...
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSync(set.id)}
                  disabled={!!syncing || synced.has(set.id)}
                >
                  {synced.has(set.id) ? "同期済み" : "同期"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

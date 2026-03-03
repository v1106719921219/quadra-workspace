"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Key, Building2, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createApiKey, deleteApiKey } from "@/actions/api-keys";

interface SettingsContentProps {
  companies: {
    id: string;
    name: string;
    format_template: string;
    website_url: string | null;
  }[];
  apiKeys: {
    id: string;
    name: string;
    key_prefix: string;
    last_used_at: string | null;
    created_at: string;
  }[];
}

export function SettingsContent({ companies, apiKeys }: SettingsContentProps) {
  const router = useRouter();
  const [apiKeyName, setApiKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerateApiKey = async () => {
    if (!apiKeyName.trim()) {
      toast.error("キー名を入力してください");
      return;
    }
    setGenerating(true);
    try {
      const { rawKey } = await createApiKey(apiKeyName);
      setGeneratedKey(rawKey);
      setApiKeyName("");
      toast.success("APIキーを生成しました");
      router.refresh();
    } catch (error) {
      toast.error(`生成エラー: ${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyKey = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey);
      toast.success("APIキーをコピーしました");
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await deleteApiKey(id);
      toast.success("APIキーを削除しました");
      router.refresh();
    } catch (error) {
      toast.error(`削除エラー: ${error instanceof Error ? error.message : "不明なエラー"}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* グレーディング会社設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            グレーディング会社
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>フォーマットテンプレート</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <Badge variant="outline">{company.id.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>{company.name}</TableCell>
                    <TableCell>
                      <code className="text-sm font-mono">
                        {company.format_template}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* APIキー管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            APIキー管理（Chrome拡張用）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Chrome拡張からAPIにアクセスするためのキーを生成します。
          </p>

          {/* キー生成 */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="キー名（例: Chrome拡張 - PC）"
              value={apiKeyName}
              onChange={(e) => setApiKeyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerateApiKey()}
              className="max-w-sm"
            />
            <Button variant="outline" onClick={handleGenerateApiKey} disabled={generating}>
              <Key className="mr-2 h-4 w-4" />
              {generating ? "生成中..." : "キー生成"}
            </Button>
          </div>

          {/* 生成されたキー表示 */}
          {generatedKey && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-2">
              <p className="text-sm font-medium text-green-800">
                APIキーが生成されました。このキーは一度しか表示されません。
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-white p-2 rounded border break-all">
                  {generatedKey}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopyKey}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-green-700">
                Chrome拡張のオプション画面にこのキーを貼り付けてください。
              </p>
            </div>
          )}

          {/* 既存キー一覧 */}
          {apiKeys.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名前</TableHead>
                    <TableHead>キープレフィックス</TableHead>
                    <TableHead>最終使用</TableHead>
                    <TableHead>作成日</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>{key.name}</TableCell>
                      <TableCell>
                        <code className="text-sm font-mono">{key.key_prefix}</code>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {key.last_used_at
                          ? new Date(key.last_used_at).toLocaleDateString("ja-JP")
                          : "未使用"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(key.created_at).toLocaleDateString("ja-JP")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleDeleteKey(key.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

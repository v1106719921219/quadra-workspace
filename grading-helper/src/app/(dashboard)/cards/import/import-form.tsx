"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Check, Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importCards, importCardMasterBatch, deleteAllCards } from "@/actions/cards";
import { parseCardMasterCsv, type CardMasterRow } from "@/lib/parse-card-master";
import Papa from "papaparse";

interface ImportFormProps {
  games: { id: string; name: string }[];
}

interface ParsedRow {
  setCode: string;
  cardNumber: string;
  nameJa?: string;
  nameEn?: string;
  rarity?: string;
  year?: number;
}

/**
 * 型番（code）からセットコードとカード番号を分離
 * "SV6a-001/053" → { setCode: "SV6a", cardNumber: "001/053" }
 * "SV6a 001" → { setCode: "SV6a", cardNumber: "001" }
 */
function parseCode(code: string): { setCode: string; cardNumber: string } {
  const trimmed = code.trim();
  if (trimmed.includes("-")) {
    const idx = trimmed.indexOf("-");
    return {
      setCode: trimmed.substring(0, idx),
      cardNumber: trimmed.substring(idx + 1),
    };
  }
  if (trimmed.includes(" ")) {
    const parts = trimmed.split(/\s+/);
    return { setCode: parts[0], cardNumber: parts.slice(1).join(" ") };
  }
  return { setCode: trimmed, cardNumber: "" };
}

/**
 * 発売日から年を抽出
 * "2024-06-07" → 2024
 */
function extractYear(dateStr: string): number | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/(\d{4})/);
  return match ? parseInt(match[1]) : undefined;
}

export function ImportForm({ games }: ImportFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardMasterInputRef = useRef<HTMLInputElement>(null);
  const [tcgGameId, setTcgGameId] = useState(games[0]?.id ?? "pokemon");
  const [textInput, setTextInput] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);

  // カードマスタCSV用の状態
  const [cardMasterRows, setCardMasterRows] = useState<CardMasterRow[]>([]);
  const [cardMasterImporting, setCardMasterImporting] = useState(false);
  const [cardMasterProgress, setCardMasterProgress] = useState(0);
  const [cardMasterFileName, setCardMasterFileName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAll = async () => {
    if (!confirm("全カードデータ・提出リストを削除します。よろしいですか？")) return;
    setDeleting(true);
    try {
      const result = await deleteAllCards();
      toast.success(`${result.deleted.toLocaleString()}件を削除しました`);
    } catch (error) {
      toast.error(`削除エラー: ${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedRow[] = results.data.map((row: unknown) => {
          const r = row as Record<string, string>;

          // GASスプレッドシート形式を自動検出
          // ヘッダーなしCSV（列順: カードID, カード名, 画像, 発売日, パック名, 型番, レアリティ, 価格, ...）
          // またはヘッダー付きCSV
          const code = r["型番"] || r["型番（入力）"] || r["code"] || r["型番コード"] || "";
          const nameJa = r["カード名"] || r["name"] || r["name_ja"] || r["日本語名"] || "";
          const rarity = r["レアリティ"] || r["rarity"] || "";
          const releasedAt = r["発売日"] || r["released_at"] || r["year"] || "";

          // 汎用フォーマットもサポート
          const setCodeDirect = r["set_code"] || r["setCode"] || r["セットコード"] || "";
          const cardNumberDirect = r["card_number"] || r["cardNumber"] || r["カード番号"] || "";

          if (setCodeDirect && cardNumberDirect) {
            // 汎用フォーマット
            return {
              setCode: setCodeDirect,
              cardNumber: cardNumberDirect,
              nameJa: nameJa || r["name_ja"] || r["nameJa"] || undefined,
              nameEn: r["name_en"] || r["nameEn"] || r["英語名"] || undefined,
              rarity: rarity || undefined,
              year: releasedAt ? extractYear(releasedAt) : (r["year"] ? parseInt(r["year"]) : undefined),
            };
          }

          if (code) {
            // GASスプレッドシート形式（型番列から分離）
            const { setCode, cardNumber } = parseCode(code);
            return {
              setCode,
              cardNumber,
              nameJa: nameJa || undefined,
              rarity: rarity || undefined,
              year: extractYear(releasedAt),
            };
          }

          return { setCode: "", cardNumber: "" };
        });

        const validRows = rows.filter((r) => r.setCode && r.cardNumber);
        setParsedRows(validRows);
        toast.success(`${validRows.length}件を読み込みました`);
      },
      error: (error) => {
        toast.error(`CSV読み込みエラー: ${error.message}`);
      },
    });
  };

  // ヘッダーなしCSV対応（列順固定: カードID, カード名, 画像, 発売日, パック名, 型番, レアリティ, ...）
  const handleFileUploadNoHeader = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedRow[] = results.data
          .slice(1) // ヘッダー行をスキップ
          .map((cols: unknown) => {
            const row = cols as string[];
            // GASの列順: A=カードID, B=カード名, C=画像, D=発売日, E=パック名, F=型番, G=レアリティ
            const code = row[5] || "";
            const nameJa = row[1] || "";
            const releasedAt = row[3] || "";
            const rarity = row[6] || "";

            if (!code) return { setCode: "", cardNumber: "" };

            const { setCode, cardNumber } = parseCode(code);
            return {
              setCode,
              cardNumber,
              nameJa: nameJa || undefined,
              rarity: rarity || undefined,
              year: extractYear(releasedAt),
            };
          });

        const validRows = rows.filter((r) => r.setCode && r.cardNumber);
        setParsedRows(validRows);
        toast.success(`${validRows.length}件を読み込みました`);
      },
      error: (error) => {
        toast.error(`CSV読み込みエラー: ${error.message}`);
      },
    });
  };

  const handleTextParse = () => {
    const lines = textInput
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const rows: ParsedRow[] = lines.map((line) => {
      const parts = line.split(/[\t,]/).map((p) => p.trim());

      // 1列だけの場合は型番として解析
      if (parts.length === 1) {
        const { setCode, cardNumber } = parseCode(parts[0]);
        return { setCode, cardNumber };
      }

      // 型番, カード名, レアリティ, 年 のフォーマットも対応
      if (parts.length >= 2 && parts[0].includes("-")) {
        const { setCode, cardNumber } = parseCode(parts[0]);
        return {
          setCode,
          cardNumber,
          nameJa: parts[1] || undefined,
          rarity: parts[2] || undefined,
          year: parts[3] ? parseInt(parts[3]) : undefined,
        };
      }

      // セットコード, カード番号, 日本語名, ... のフォーマット
      return {
        setCode: parts[0] || "",
        cardNumber: parts[1] || "",
        nameJa: parts[2] || undefined,
        nameEn: parts[3] || undefined,
        rarity: parts[4] || undefined,
        year: parts[5] ? parseInt(parts[5]) : undefined,
      };
    });

    const validRows = rows.filter((r) => r.setCode && r.cardNumber);
    setParsedRows(validRows);
    toast.success(`${validRows.length}件を解析しました`);
  };

  // カードマスタCSVファイル読み込み
  const handleCardMasterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCardMasterFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCardMasterCsv(text);
      setCardMasterRows(parsed);
      toast.success(`${parsed.length}件のカードを読み込みました`);
    };
    reader.onerror = () => {
      toast.error("ファイル読み込みエラー");
    };
    reader.readAsText(file);
  };

  // カードマスタCSVインポート実行（チャンク分割）
  const handleCardMasterImport = async () => {
    if (cardMasterRows.length === 0) {
      toast.error("インポートするデータがありません");
      return;
    }

    setCardMasterImporting(true);
    setCardMasterProgress(0);

    const CHUNK_SIZE = 2000; // 2000行ずつサーバーに送信
    let totalImported = 0;

    try {
      for (let i = 0; i < cardMasterRows.length; i += CHUNK_SIZE) {
        const chunk = cardMasterRows.slice(i, i + CHUNK_SIZE);
        const rows = chunk.map((row) => ({
          setCode: row.setCode,
          cardNumber: row.cardNumber,
          cardName: row.cardName,
          rarity: row.rarity,
          packName: row.packName || undefined,
        }));

        const result = await importCardMasterBatch(rows);
        totalImported += result.imported;

        const progress = Math.min(
          100,
          Math.round(((i + chunk.length) / cardMasterRows.length) * 100)
        );
        setCardMasterProgress(progress);
      }

      toast.success(
        `${totalImported.toLocaleString()}件をインポートしました`
      );
      router.push("/cards");
    } catch (error) {
      toast.error(
        `インポートエラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    } finally {
      setCardMasterImporting(false);
    }
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) {
      toast.error("インポートするデータがありません");
      return;
    }

    setImporting(true);
    try {
      const result = await importCards(tcgGameId, parsedRows);
      toast.success(`${result.imported}件をインポートしました`);
      router.push("/cards");
    } catch (error) {
      toast.error(
        `インポートエラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* TCGゲーム選択 & 全データ削除 */}
      <div className="flex items-center justify-between">
        <div className="w-64">
          <Label>TCGゲーム</Label>
          <Select value={tcgGameId} onValueChange={setTcgGameId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {games.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDeleteAll}
          disabled={deleting}
        >
          {deleting ? "削除中..." : "全データ削除"}
        </Button>
      </div>

      {/* カードマスタCSV（メイン） */}
      <Card className="border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            カードマスタCSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={cardMasterInputRef}
            type="file"
            accept=".csv"
            onChange={handleCardMasterUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => cardMasterInputRef.current?.click()}
            disabled={cardMasterImporting}
          >
            <Upload className="mr-2 h-4 w-4" />
            カードマスタCSVを選択
          </Button>
          <p className="text-xs text-muted-foreground">
            フォーマット: &quot;カード名 レアリティ [セットコード 番号/総数](パック名)&quot;
          </p>

          {cardMasterRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {cardMasterFileName}: {cardMasterRows.length.toLocaleString()}件
                </span>
                <Button
                  onClick={handleCardMasterImport}
                  disabled={cardMasterImporting}
                  size="sm"
                >
                  {cardMasterImporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  {cardMasterImporting ? "インポート中..." : "インポート実行"}
                </Button>
              </div>

              {cardMasterImporting && (
                <div className="space-y-1">
                  <Progress value={cardMasterProgress} />
                  <p className="text-xs text-muted-foreground text-center">
                    {cardMasterProgress}%
                  </p>
                </div>
              )}

              {/* プレビュー */}
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>カード名</TableHead>
                      <TableHead>セット</TableHead>
                      <TableHead>番号</TableHead>
                      <TableHead>レアリティ</TableHead>
                      <TableHead>パック名</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cardMasterRows.slice(0, 50).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{row.cardName}</TableCell>
                        <TableCell className="font-mono">{row.setCode}</TableCell>
                        <TableCell className="font-mono">{row.cardNumber}</TableCell>
                        <TableCell>{row.rarity || "-"}</TableCell>
                        <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                          {row.packName || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {cardMasterRows.length > 50 && (
                <p className="text-xs text-muted-foreground">
                  先頭50件を表示中（全{cardMasterRows.length.toLocaleString()}件）
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* CSVアップロード（ヘッダー付き） */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              CSVファイル（ヘッダー付き）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              CSVファイルを選択
            </Button>
            <p className="text-xs text-muted-foreground">
              GASスプレッドシートのCSVに対応（「型番」「カード名」「レアリティ」「発売日」列を自動検出）
            </p>
          </CardContent>
        </Card>

        {/* GASスプレッドシートCSV（列順固定） */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              GASスプレッドシートCSV（列順固定）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              type="file"
              accept=".csv,.tsv"
              onChange={handleFileUploadNoHeader}
              className="hidden"
              id="gasUpload"
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => document.getElementById("gasUpload")?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              GAS形式CSVを選択
            </Button>
            <p className="text-xs text-muted-foreground">
              列順: カードID, カード名, 画像, 発売日, パック名, 型番, レアリティ, ...
            </p>
          </CardContent>
        </Card>
      </div>

      {/* テキスト入力 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            テキスト入力
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder={`SV6a-001/053\tリザードンex\tSAR\t2024\nSV6a-025/053\tピカチュウex\tRR\t2024\n\nまたは型番だけ:\nSV6a-001/053\nSV6a-025/053`}
            rows={6}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            className="font-mono text-sm"
          />
          <Button variant="outline" className="w-full" onClick={handleTextParse}>
            テキストを解析
          </Button>
          <p className="text-xs text-muted-foreground">
            タブ/カンマ区切り: 型番, カード名, レアリティ, 年（型番だけでもOK）
          </p>
        </CardContent>
      </Card>

      {/* プレビュー */}
      {parsedRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>プレビュー ({parsedRows.length}件)</span>
              <Button onClick={handleImport} disabled={importing}>
                <Check className="mr-2 h-4 w-4" />
                {importing ? "インポート中..." : "インポート実行"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>セット</TableHead>
                    <TableHead>番号</TableHead>
                    <TableHead>日本語名</TableHead>
                    <TableHead>英語名</TableHead>
                    <TableHead>レアリティ</TableHead>
                    <TableHead>年</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 100).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{row.setCode}</TableCell>
                      <TableCell className="font-mono">{row.cardNumber}</TableCell>
                      <TableCell>{row.nameJa || "-"}</TableCell>
                      <TableCell>{row.nameEn || "-"}</TableCell>
                      <TableCell>{row.rarity || "-"}</TableCell>
                      <TableCell>{row.year || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsedRows.length > 100 && (
              <p className="mt-2 text-sm text-muted-foreground">
                先頭100件を表示中（全{parsedRows.length}件）
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

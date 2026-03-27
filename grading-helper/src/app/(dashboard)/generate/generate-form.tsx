"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, Sparkles, Plus, Trash2, Search, Loader2, Database, Globe, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import {
  generateGradingName,
  type PokemonNameEntry,
  type GradingNameResult,
} from "@/lib/grading-name";
import { lookupCardBySetNumber } from "@/actions/cards";
import { parseCardMasterCsv } from "@/lib/parse-card-master";

interface GenerateFormProps {
  pokemonNames: PokemonNameEntry[];
  companies: {
    id: string;
    name: string;
    format_template: string;
  }[];
}

interface BatchItem {
  id: string;
  setNumber: string;
  cardName: string;
  year: number;
  result: GradingNameResult | null;
  source?: "db" | "tcgdex" | "manual" | "not_found";
}

export function GenerateForm({ pokemonNames, companies }: GenerateFormProps) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "psa");
  const [singleSetNumber, setSingleSetNumber] = useState("");
  const [singleCardName, setSingleCardName] = useState("");
  const [singleYear, setSingleYear] = useState(new Date().getFullYear());
  const [singleResult, setSingleResult] = useState<GradingNameResult | null>(null);
  const [singleSource, setSingleSource] = useState<string>("");
  const [looking, setLooking] = useState(false);

  // バッチモード
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchInput, setBatchInput] = useState("");
  const [batchProcessing, setBatchProcessing] = useState(false);

  const selectedCompany = companies.find((c) => c.id === companyId);
  const template = selectedCompany?.format_template;

  // 型番から自動検索して生成
  const handleGenerate = useCallback(async () => {
    if (!singleSetNumber) {
      toast.error("型番を入力してください");
      return;
    }

    let cardName = singleCardName;

    // カード名が空の場合、型番から自動検索
    if (!cardName) {
      setLooking(true);
      setSingleSource("");
      try {
        const lookup = await lookupCardBySetNumber(singleSetNumber);
        if (lookup && lookup.nameJa) {
          cardName = lookup.nameJa;
          setSingleCardName(cardName);
          setSingleSource(lookup.source);

          // DBにgrading_nameが保存済みならそのまま使う
          if (lookup.gradingName) {
            setSingleResult({
              gradingName: lookup.gradingName,
              cardNumber: lookup.gradingName.match(/\d{3}/)?.[1] ?? "",
              pokemonNameEn: "",
              suffix: "",
              isMega: false,
              debug: { originalName: cardName, strippedName: cardName, matchedPokemon: null },
            });
            setLooking(false);
            return;
          }
        } else {
          setLooking(false);
          toast.error("カード名が見つかりませんでした。手動で入力してください。");
          return;
        }
      } catch {
        setLooking(false);
        toast.error("検索に失敗しました");
        return;
      }
      setLooking(false);
    } else {
      setSingleSource("manual");
    }

    const result = generateGradingName(
      { setNumber: singleSetNumber, cardName, year: singleYear, template },
      pokemonNames
    );
    setSingleResult(result);
  }, [singleSetNumber, singleCardName, singleYear, template, pokemonNames]);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("コピーしました");
  };

  // 一括生成（型番のみでもOK）
  const handleBatchParse = async () => {
    const lines = batchInput
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      toast.error("型番を入力してください");
      return;
    }

    setBatchProcessing(true);
    const items: BatchItem[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      // タブまたはカンマ区切り: 型番\tカード名\t年 or 型番のみ
      const parts = line.split(/[\t,]/).map((p) => p.trim());
      const setNumber = parts[0] || "";
      let cardName = parts[1] || "";
      const year = parts[2] ? parseInt(parts[2]) : singleYear;
      let source: BatchItem["source"] = "manual";

      // カード名がない場合はDB/API検索
      if (setNumber && !cardName) {
        try {
          const lookup = await lookupCardBySetNumber(setNumber);
          if (lookup?.nameJa) {
            cardName = lookup.nameJa;
            source = lookup.source;
          } else {
            source = "not_found";
          }
        } catch {
          source = "not_found";
        }
      }

      let result: GradingNameResult | null = null;
      if (setNumber && cardName) {
        result = generateGradingName(
          { setNumber, cardName, year, template },
          pokemonNames
        );
      }

      items.push({
        id: `batch-${idx}-${Date.now()}`,
        setNumber,
        cardName,
        year,
        result,
        source,
      });
    }

    setBatchItems(items);
    const found = items.filter((i) => i.result).length;
    const notFound = items.length - found;
    let msg = `${found}件を生成しました`;
    if (notFound > 0) msg += `（${notFound}件はカード名が見つかりませんでした）`;
    toast.success(msg);
    setBatchProcessing(false);
  };

  const handleCopyAll = async () => {
    const lines = batchItems
      .filter((item) => item.result)
      .map((item) => item.result!.gradingName);
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success(`${lines.length}件をコピーしました`);
  };

  const handleRemoveBatchItem = (id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  };

  // --- CSV一括生成 ---
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvResults, setCsvResults] = useState<
    { setNumber: string; cardName: string; gradingName: string; source: string }[]
  >([]);
  const [csvProcessing, setCsvProcessing] = useState(false);
  const [csvProgress, setCsvProgress] = useState(0);

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = parseCardMasterCsv(text);

    if (parsed.length === 0) {
      toast.error("カードデータが見つかりませんでした");
      return;
    }

    setCsvProcessing(true);
    setCsvProgress(0);
    setCsvResults([]);

    const results: typeof csvResults = [];
    const CHUNK = 20;

    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);

      for (const row of chunk) {
        const setNumber = `${row.setCode}-${row.cardNumber}`;
        const cardName = row.cardName;

        if (!cardName) {
          results.push({ setNumber, cardName: "", gradingName: "", source: "not_found" });
          continue;
        }

        const result = generateGradingName(
          { setNumber, cardName, year: singleYear, template },
          pokemonNames
        );

        results.push({
          setNumber,
          cardName,
          gradingName: result.gradingName,
          source: "csv",
        });
      }

      setCsvProgress(Math.min(100, Math.round(((i + chunk.length) / parsed.length) * 100)));
    }

    setCsvResults(results);
    const found = results.filter((r) => r.gradingName).length;
    toast.success(`${found.toLocaleString()}/${results.length.toLocaleString()}件の英語名を生成しました`);
    setCsvProcessing(false);
    // リセットして同じファイルを再選択可能に
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const handleCopyCsvResults = async () => {
    const lines = csvResults
      .filter((r) => r.gradingName)
      .map((r) => r.gradingName);
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success(`${lines.length.toLocaleString()}件をコピーしました`);
  };

  const handleDownloadCsv = () => {
    const header = "型番,カード名,英語名";
    const lines = csvResults.map(
      (r) => `"${r.setNumber}","${r.cardName}","${r.gradingName}"`
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grading-names-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sourceLabel = (source?: string) => {
    switch (source) {
      case "db": return { text: "DB", variant: "default" as const };
      case "tcgdex": return { text: "TCGdex", variant: "secondary" as const };
      case "manual": return { text: "手動", variant: "outline" as const };
      case "not_found": return { text: "未検出", variant: "destructive" as const };
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* グレーディング会社選択 */}
      <div className="flex items-center gap-4">
        <div className="w-48">
          <Label>グレーディング会社</Label>
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.id.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-32">
          <Label>デフォルト年</Label>
          <Input
            type="number"
            min={1996}
            max={2030}
            value={singleYear}
            onChange={(e) => setSingleYear(parseInt(e.target.value) || new Date().getFullYear())}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 単品生成 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              単品生成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setNumber">型番</Label>
              <Input
                id="setNumber"
                placeholder="例: SV6a-001/053"
                value={singleSetNumber}
                onChange={(e) => setSingleSetNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cardName">
                カード名
                <span className="text-muted-foreground font-normal ml-2">
                  空欄ならDB/APIから自動検索
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cardName"
                  placeholder="空欄で型番から自動検索"
                  value={singleCardName}
                  onChange={(e) => setSingleCardName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                />
                {singleSource && sourceLabel(singleSource) && (
                  <Badge variant={sourceLabel(singleSource)!.variant} className="shrink-0">
                    {singleSource === "db" && <Database className="mr-1 h-3 w-3" />}
                    {singleSource === "tcgdex" && <Globe className="mr-1 h-3 w-3" />}
                    {sourceLabel(singleSource)!.text}
                  </Badge>
                )}
              </div>
            </div>
            <Button onClick={handleGenerate} className="w-full" disabled={looking}>
              {looking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  検索中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  生成（型番のみでOK）
                </>
              )}
            </Button>

            {singleResult && (
              <div className="space-y-3 pt-2">
                <Separator />
                <div className="space-y-2">
                  <Label className="text-muted-foreground">生成結果</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md bg-muted p-3 text-sm font-mono break-all">
                      {singleResult.gradingName}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopy(singleResult.gradingName)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">番号: {singleResult.cardNumber}</Badge>
                  <Badge variant="outline">名前: {singleResult.pokemonNameEn}</Badge>
                  {singleResult.suffix && (
                    <Badge variant="secondary">{singleResult.suffix}</Badge>
                  )}
                  {singleResult.isMega && <Badge>MEGA</Badge>}
                </div>
                {!singleResult.debug.matchedPokemon && (
                  <p className="text-xs text-destructive">
                    ポケモン名辞書に一致するエントリが見つかりませんでした
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 一括生成 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              一括生成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>
                入力（1行1型番、またはタブ区切り: 型番, カード名, 年）
              </Label>
              <Textarea
                placeholder={`SV6a-001/053\nSV6a-025/053\nSV7-010/101\tピカチュウex\t2024`}
                rows={8}
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                型番だけ入力すればDB/TCGdexからカード名を自動検索します
              </p>
            </div>
            <Button
              onClick={handleBatchParse}
              className="w-full"
              disabled={batchProcessing}
            >
              {batchProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  検索中...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  一括生成
                </>
              )}
            </Button>

            {batchItems.length > 0 && (
              <div className="space-y-3 pt-2">
                <Separator />
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground">
                    結果 ({batchItems.filter((i) => i.result).length}/{batchItems.length}件)
                  </Label>
                  <Button variant="outline" size="sm" onClick={handleCopyAll}>
                    <Copy className="mr-2 h-3 w-3" />
                    全件コピー
                  </Button>
                </div>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {batchItems.map((item) => {
                    const src = sourceLabel(item.source);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-2 rounded-md border p-2 ${
                          !item.result ? "border-destructive/50 bg-destructive/5" : ""
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-sm truncate">
                              {item.result?.gradingName ?? "カード名が見つかりません"}
                            </p>
                            {src && (
                              <Badge variant={src.variant} className="shrink-0 text-xs px-1.5 py-0">
                                {src.text}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.setNumber}
                            {item.cardName ? ` / ${item.cardName}` : ""}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-7 w-7"
                          onClick={() =>
                            item.result && handleCopy(item.result.gradingName)
                          }
                          disabled={!item.result}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-7 w-7"
                          onClick={() => handleRemoveBatchItem(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CSV一括生成 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            CSVから一括生成
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            カードマスタCSVをアップロードすると、全カードの英語名を一括生成します。
            DB登録不要で、CSVに含まれるカード名から直接変換します。
          </p>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvProcessing}
          >
            {csvProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {csvProcessing ? "生成中..." : "カードマスタCSVを選択"}
          </Button>

          {csvProcessing && (
            <div className="space-y-1">
              <Progress value={csvProgress} />
              <p className="text-xs text-muted-foreground text-center">{csvProgress}%</p>
            </div>
          )}

          {csvResults.length > 0 && !csvProcessing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {csvResults.filter((r) => r.gradingName).length.toLocaleString()}/
                  {csvResults.length.toLocaleString()}件
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyCsvResults}>
                    <Copy className="mr-1 h-3 w-3" />
                    英語名を全件コピー
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadCsv}>
                    <Download className="mr-1 h-3 w-3" />
                    CSVダウンロード
                  </Button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>型番</TableHead>
                      <TableHead>カード名</TableHead>
                      <TableHead>英語名</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvResults.slice(0, 200).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs">{row.setNumber}</TableCell>
                        <TableCell className="text-sm">{row.cardName || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.gradingName || (
                            <span className="text-destructive">生成不可</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {csvResults.length > 200 && (
                <p className="text-xs text-muted-foreground">
                  先頭200件を表示中（全{csvResults.length.toLocaleString()}件）
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

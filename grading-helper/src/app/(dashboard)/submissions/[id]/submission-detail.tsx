"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  Trash2,
  Plus,
  ArrowLeft,
  CheckCircle,
  Package,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import {
  addSubmissionItem,
  removeSubmissionItem,
  updateSubmissionStatus,
  updateSubmissionItem,
} from "@/actions/submissions";
import {
  generateGradingName,
  type PokemonNameEntry,
} from "@/lib/grading-name";
import { lookupCardBySetNumber, quickSearchCards } from "@/actions/cards";

interface SubmissionItem {
  id: string;
  sort_order: number;
  set_code: string;
  card_number: string;
  name_ja: string | null;
  grading_name: string;
  declared_value: number | null;
  notes: string | null;
  rarity: string | null;
  purchase_cost: number | null;
  sold_price: number | null;
  sold: boolean;
  grading_fee: number | null;
  other_fees: number | null;
  grading_result: string | null;
  cert_number: string | null;
  plan: string | null;
  completed_at: string | null;
}

interface SubmissionDetailProps {
  submission: {
    id: string;
    title: string;
    status: string;
    grading_company_id: string;
    notes: string | null;
    created_at: string;
    grading_companies: {
      id: string;
      name: string;
      format_template: string;
    } | null;
  };
  items: SubmissionItem[];
  pokemonNames: PokemonNameEntry[];
  companies: { id: string; name: string; format_template: string }[];
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "作成中", variant: "secondary" },
  submitted: { label: "提出済", variant: "default" },
  returned: { label: "返却済", variant: "outline" },
};

const GRADING_RESULTS = [
  "10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6",
  "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1",
  "AUTH", "N/A",
];

function calcProfit(item: SubmissionItem): number | null {
  if (item.sold_price == null) return null;
  return (
    (item.sold_price || 0) -
    (item.purchase_cost || 0) -
    (item.grading_fee || 0) -
    (item.other_fees || 0)
  );
}

function formatCurrency(value: number | null): string {
  if (value == null) return "-";
  return `¥${value.toLocaleString()}`;
}

// インライン編集セル
function EditableCell({
  value,
  onSave,
  type = "text",
  className = "",
}: {
  value: string;
  onSave: (val: string) => void;
  type?: "text" | "number";
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    setEditing(false);
    if (editValue !== value) {
      onSave(editValue);
    }
  };

  if (editing) {
    return (
      <Input
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") {
            setEditValue(value);
            setEditing(false);
          }
        }}
        autoFocus
        className={`h-7 text-xs ${className}`}
      />
    );
  }

  return (
    <div
      className={`cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 min-h-[28px] flex items-center text-xs ${className}`}
      onClick={() => {
        setEditValue(value);
        setEditing(true);
      }}
    >
      {value || <span className="text-muted-foreground">-</span>}
    </div>
  );
}

// 数値セル（円表示）
function EditableNumberCell({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (val: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value?.toString() ?? "");

  const handleSave = () => {
    setEditing(false);
    const num = editValue === "" ? null : parseInt(editValue);
    if (num !== value) {
      onSave(num);
    }
  };

  if (editing) {
    return (
      <Input
        type="number"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") {
            setEditValue(value?.toString() ?? "");
            setEditing(false);
          }
        }}
        autoFocus
        className="h-7 text-xs w-24"
      />
    );
  }

  return (
    <div
      className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 min-h-[28px] flex items-center text-xs font-mono"
      onClick={() => {
        setEditValue(value?.toString() ?? "");
        setEditing(true);
      }}
    >
      {value != null ? `¥${value.toLocaleString()}` : <span className="text-muted-foreground">-</span>}
    </div>
  );
}

export function SubmissionDetail({
  submission,
  items,
  pokemonNames,
}: SubmissionDetailProps) {
  const router = useRouter();
  const [batchInput, setBatchInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [defaultYear, setDefaultYear] = useState(new Date().getFullYear());

  // カード検索
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; set_code: string; card_number: string; name_ja: string | null; name_en: string | null; rarity: string | null }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);

  const template = submission.grading_companies?.format_template;
  const status = STATUS_MAP[submission.status] ?? STATUS_MAP.draft;

  const handleUpdateField = useCallback(
    async (itemId: string, fields: Parameters<typeof updateSubmissionItem>[1]) => {
      try {
        await updateSubmissionItem(itemId, fields);
        router.refresh();
      } catch (error) {
        toast.error(
          `更新エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
        );
      }
    },
    [router]
  );

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await quickSearchCards(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        toast.error("該当するカードが見つかりません");
      }
    } catch {
      toast.error("検索に失敗しました");
    } finally {
      setSearching(false);
    }
  };

  const handleAddFromSearch = async (card: typeof searchResults[0]) => {
    setAddingCardId(card.id);
    try {
      const setNumber = `${card.set_code}-${card.card_number}`;
      const cardName = card.name_ja || "";

      const result = generateGradingName(
        { setNumber, cardName, year: defaultYear, template },
        pokemonNames
      );

      await addSubmissionItem({
        submissionId: submission.id,
        setCode: card.set_code,
        cardNumber: card.card_number,
        nameJa: cardName,
        gradingName: result.gradingName,
        rarity: card.rarity || undefined,
      });

      toast.success(`${cardName || setNumber} を追加しました`);
      router.refresh();
    } catch (error) {
      toast.error(`追加エラー: ${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      setAddingCardId(null);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("コピーしました");
  };

  const handleCopyAll = async () => {
    const lines = items.map((item) => item.grading_name);
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success(`${lines.length}件をコピーしました`);
  };

  const handleBatchAdd = async () => {
    const lines = batchInput
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      toast.error("型番を入力してください");
      return;
    }

    setAdding(true);
    let added = 0;
    let notFound = 0;

    try {
      for (const line of lines) {
        const parts = line.split(/[\t,]/).map((p) => p.trim());
        const setNumber = parts[0] || "";
        let cardName = parts[1] || "";
        const year = parts[2] ? parseInt(parts[2]) : defaultYear;

        if (!setNumber) continue;

        // 型番からDB自動検索
        if (!cardName) {
          try {
            const lookup = await lookupCardBySetNumber(setNumber);
            if (lookup?.nameJa) {
              cardName = lookup.nameJa;
            }
          } catch {
            // 検索失敗は無視して次へ
          }
        }

        if (!cardName) {
          notFound++;
          continue;
        }

        // 年を指定してgrading_nameを動的生成
        const result = generateGradingName(
          { setNumber, cardName, year, template },
          pokemonNames
        );

        const setCode = setNumber.includes("-")
          ? setNumber.split("-")[0]
          : setNumber;
        const cardNumber = setNumber.includes("-")
          ? setNumber.split("-")[1]?.split("/")[0] ?? ""
          : setNumber;

        await addSubmissionItem({
          submissionId: submission.id,
          setCode,
          cardNumber,
          nameJa: cardName,
          gradingName: result.gradingName,
        });
        added++;
      }

      let msg = `${added}件を追加しました`;
      if (notFound > 0) msg += `（${notFound}件はカード名が見つかりませんでした）`;
      toast.success(msg);
      setBatchInput("");
      router.refresh();
    } catch (error) {
      toast.error(
        `追加エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await removeSubmissionItem(itemId, submission.id);
      toast.success("削除しました");
      router.refresh();
    } catch (error) {
      toast.error(
        `削除エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    }
  };

  const handleStatusChange = async (newStatus: "draft" | "submitted" | "returned") => {
    try {
      await updateSubmissionStatus(submission.id, newStatus);
      toast.success("ステータスを更新しました");
      router.refresh();
    } catch (error) {
      toast.error(
        `更新エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    }
  };

  // サマリー計算
  const totalPurchaseCost = items.reduce((sum, i) => sum + (i.purchase_cost || 0), 0);
  const totalGradingFee = items.reduce((sum, i) => sum + (i.grading_fee || 0), 0);
  const totalOtherFees = items.reduce((sum, i) => sum + (i.other_fees || 0), 0);
  const totalSoldPrice = items.reduce((sum, i) => sum + (i.sold_price || 0), 0);
  const totalProfit = items.reduce((sum, i) => {
    const p = calcProfit(i);
    return sum + (p ?? 0);
  }, 0);
  const soldCount = items.filter((i) => i.sold).length;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/submissions">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{submission.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">
              {submission.grading_company_id.toUpperCase()}
            </Badge>
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="text-sm text-muted-foreground">
              {items.length}枚
            </span>
            {soldCount > 0 && (
              <span className="text-sm text-muted-foreground">
                （SOLD: {soldCount}枚）
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {submission.status === "draft" && (
            <Button
              variant="outline"
              onClick={() => handleStatusChange("submitted")}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              提出済みにする
            </Button>
          )}
          {submission.status === "submitted" && (
            <Button
              variant="outline"
              onClick={() => handleStatusChange("returned")}
            >
              <Package className="mr-2 h-4 w-4" />
              返却済みにする
            </Button>
          )}
          {items.length > 0 && (
            <Button onClick={handleCopyAll}>
              <Copy className="mr-2 h-4 w-4" />
              全件コピー
            </Button>
          )}
        </div>
      </div>

      {/* カード追加 */}
      {submission.status === "draft" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              カード追加
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* カード検索 */}
            <div className="space-y-3">
              <Label>カード検索（番号 or カード名）</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="例: 246 / リザードン / M2a-246"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1"
                />
                <div className="w-24">
                  <Input
                    type="number"
                    min={1996}
                    max={2030}
                    value={defaultYear}
                    onChange={(e) => setDefaultYear(parseInt(e.target.value) || new Date().getFullYear())}
                    placeholder="年"
                  />
                </div>
                <Button onClick={handleSearch} disabled={searching} variant="outline">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>セット</TableHead>
                        <TableHead>番号</TableHead>
                        <TableHead>カード名</TableHead>
                        <TableHead>英語名</TableHead>
                        <TableHead>レアリティ</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchResults.map((card) => (
                        <TableRow
                          key={card.id}
                          className="cursor-pointer hover:bg-primary/10"
                          onClick={() => !addingCardId && handleAddFromSearch(card)}
                        >
                          <TableCell>
                            <Badge variant="outline" className="font-mono">{card.set_code}</Badge>
                          </TableCell>
                          <TableCell className="font-mono">{card.card_number}</TableCell>
                          <TableCell>{card.name_ja || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{card.name_en || "-"}</TableCell>
                          <TableCell>{card.rarity || "-"}</TableCell>
                          <TableCell>
                            {addingCardId === card.id && (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <Separator />

            {/* バッチ入力 */}
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label>型番を入力（1行1型番、セットコード付き）</Label>
                <Textarea
                  placeholder={`SV6a-001/053\nSV6a-025/053\nSV7-010/101`}
                  rows={5}
                  value={batchInput}
                  onChange={(e) => setBatchInput(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  型番だけ入力すれば、カード名・英語名はDBから自動取得します
                </p>
              </div>
            </div>
            <Button onClick={handleBatchAdd} disabled={adding}>
              {adding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {adding ? "追加中..." : "一括追加"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* サマリー */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">合計仕入値</div>
              <div className="text-lg font-bold font-mono">{formatCurrency(totalPurchaseCost || null)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">合計売値</div>
              <div className="text-lg font-bold font-mono">{formatCurrency(totalSoldPrice || null)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">合計鑑定料</div>
              <div className="text-lg font-bold font-mono">{formatCurrency(totalGradingFee || null)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">合計手数料</div>
              <div className="text-lg font-bold font-mono">{formatCurrency(totalOtherFees || null)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-muted-foreground">合計粗利</div>
              <div className={`text-lg font-bold font-mono ${totalProfit > 0 ? "text-green-600" : totalProfit < 0 ? "text-red-600" : ""}`}>
                {formatCurrency(totalProfit)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* カード一覧（横スクロール対応） */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 sticky left-0 bg-background">#</TableHead>
              <TableHead className="min-w-[100px]">カード名</TableHead>
              <TableHead className="min-w-[80px]">レアリティ</TableHead>
              <TableHead className="min-w-[200px]">英語名</TableHead>
              <TableHead className="min-w-[90px]">売値</TableHead>
              <TableHead className="min-w-[90px]">仕入値</TableHead>
              <TableHead className="min-w-[120px]">メモ</TableHead>
              <TableHead className="w-14">SOLD</TableHead>
              <TableHead className="min-w-[90px]">鑑定料</TableHead>
              <TableHead className="min-w-[90px]">手数料</TableHead>
              <TableHead className="min-w-[80px]">粗利</TableHead>
              <TableHead className="min-w-[100px]">完了日</TableHead>
              <TableHead className="min-w-[80px]">鑑定結果</TableHead>
              <TableHead className="min-w-[100px]">鑑定番号</TableHead>
              <TableHead className="min-w-[80px]">プラン</TableHead>
              <TableHead className="w-10">
                <Copy className="h-3 w-3" />
              </TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={17}
                  className="text-center text-muted-foreground py-8"
                >
                  カードがありません。上のフォームから追加してください。
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, idx) => {
                const profit = calcProfit(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground text-xs sticky left-0 bg-background">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>
                        <span className="font-mono text-muted-foreground">{item.set_code}-{item.card_number}</span>
                        {" "}
                        {item.name_ja || "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <EditableCell
                        value={item.rarity || ""}
                        onSave={(val) => handleUpdateField(item.id, { rarity: val || null })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="font-mono text-xs truncate max-w-[180px]">
                          {item.grading_name}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <EditableNumberCell
                        value={item.sold_price}
                        onSave={(val) => handleUpdateField(item.id, { sold_price: val })}
                      />
                    </TableCell>
                    <TableCell>
                      <EditableNumberCell
                        value={item.purchase_cost}
                        onSave={(val) => handleUpdateField(item.id, { purchase_cost: val })}
                      />
                    </TableCell>
                    <TableCell>
                      <EditableCell
                        value={item.notes || ""}
                        onSave={(val) => handleUpdateField(item.id, { notes: val || null })}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={item.sold}
                        onCheckedChange={(checked) =>
                          handleUpdateField(item.id, { sold: !!checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <EditableNumberCell
                        value={item.grading_fee}
                        onSave={(val) => handleUpdateField(item.id, { grading_fee: val })}
                      />
                    </TableCell>
                    <TableCell>
                      <EditableNumberCell
                        value={item.other_fees}
                        onSave={(val) => handleUpdateField(item.id, { other_fees: val })}
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-mono ${
                          profit != null && profit > 0
                            ? "text-green-600"
                            : profit != null && profit < 0
                            ? "text-red-600"
                            : ""
                        }`}
                      >
                        {profit != null ? formatCurrency(profit) : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <EditableCell
                        value={item.completed_at ? new Date(item.completed_at).toLocaleDateString("ja-JP") : ""}
                        onSave={(val) => {
                          if (!val) {
                            handleUpdateField(item.id, { completed_at: null });
                            return;
                          }
                          // YYYY/MM/DD or YYYY-MM-DD形式をパース
                          const parsed = new Date(val.replace(/\//g, "-"));
                          if (!isNaN(parsed.getTime())) {
                            handleUpdateField(item.id, { completed_at: parsed.toISOString() });
                          }
                        }}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.grading_result || ""}
                        onValueChange={(val) =>
                          handleUpdateField(item.id, {
                            grading_result: val === "__clear__" ? null : val,
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-20">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__clear__">-</SelectItem>
                          {GRADING_RESULTS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <EditableCell
                        value={item.cert_number || ""}
                        onSave={(val) => handleUpdateField(item.id, { cert_number: val || null })}
                        className="font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <EditableCell
                        value={item.plan || ""}
                        onSave={(val) => handleUpdateField(item.id, { plan: val || null })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopy(item.grading_name)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      {submission.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveItem(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Copy, Search, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface Card {
  id: string;
  tcg_game_id: string;
  set_code: string;
  card_number: string;
  name_ja: string | null;
  name_en: string | null;
  grading_name: string | null;
  rarity: string | null;
  year: number | null;
}

interface CardListProps {
  cards: Card[];
  total: number;
  page: number;
  perPage: number;
  games: { id: string; name: string }[];
  currentQuery?: string;
  currentGame?: string;
}

export function CardList({
  cards,
  total,
  page,
  perPage,
  games,
  currentQuery,
  currentGame,
}: CardListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(currentQuery ?? "");

  const totalPages = Math.ceil(total / perPage);

  const updateParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    // 検索条件変更時はページをリセット
    if (!updates.page) params.delete("page");
    router.push(`/cards?${params.toString()}`);
  };

  const handleSearch = () => {
    updateParams({ q: query || undefined });
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("コピーしました");
  };

  return (
    <div className="space-y-4">
      {/* フィルター */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="カード名・型番で検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="max-w-sm"
          />
          <Button variant="outline" size="icon" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <Select
          value={currentGame ?? "all"}
          onValueChange={(v) =>
            updateParams({ game: v === "all" ? undefined : v })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="TCGゲーム" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {games.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild>
          <Link href="/cards/import">
            <Upload className="mr-2 h-4 w-4" />
            インポート
          </Link>
        </Button>
      </div>

      {/* テーブル */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">セット</TableHead>
              <TableHead className="w-20">番号</TableHead>
              <TableHead>日本語名</TableHead>
              <TableHead>英語名</TableHead>
              <TableHead>グレーディング名</TableHead>
              <TableHead className="w-16">年</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  カードが見つかりません
                </TableCell>
              </TableRow>
            ) : (
              cards.map((card) => (
                <TableRow key={card.id}>
                  <TableCell>
                    <Badge variant="outline">{card.set_code}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{card.card_number}</TableCell>
                  <TableCell>{card.name_ja || "-"}</TableCell>
                  <TableCell>{card.name_en || "-"}</TableCell>
                  <TableCell className="max-w-xs">
                    {card.grading_name ? (
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-sm truncate">
                          {card.grading_name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => handleCopy(card.grading_name!)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{card.year || "-"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() =>
                        card.grading_name && handleCopy(card.grading_name)
                      }
                      disabled={!card.grading_name}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total}件中 {(page - 1) * perPage + 1}-
            {Math.min(page * perPage, total)}件
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

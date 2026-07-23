"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { jstYearMonth } from "@/lib/time-utils";
import { getResidentTaxSchedule, saveResidentTaxSchedule } from "./actions";

// 年度 = fiscalYear年6月 〜 fiscalYear+1年5月
const MONTH_LABELS = ["6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月", "4月", "5月"];

function currentFiscalYear(): number {
  const { year, month } = jstYearMonth();
  return month >= 6 ? year : year - 1;
}

export function ResidentTaxDialog({
  employeeId,
  employeeName,
  open,
  onOpenChange,
}: {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [fiscalYear, setFiscalYear] = useState(currentFiscalYear);
  const [amounts, setAmounts] = useState<number[]>(Array(12).fill(0));
  const [annualTax, setAnnualTax] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (fy: number) => {
    setLoading(true);
    try {
      const schedule = await getResidentTaxSchedule(employeeId, fy);
      const arr = schedule.map((s) => s.amount);
      setAmounts(arr);
      setAnnualTax(arr.reduce((a, b) => a + b, 0));
    } catch {
      toast.error("読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (open) {
      load(fiscalYear);
    }
  }, [open, fiscalYear, load]);

  // 年税額を自動配分（100円未満の端数は最初の月=6月分に加算）
  function distribute() {
    const annual = Math.max(0, Math.round(annualTax));
    const monthly = Math.floor(annual / 12 / 100) * 100;
    const first = annual - monthly * 11;
    setAmounts([first, ...Array(11).fill(monthly)]);
  }

  function setAmount(i: number, value: string) {
    const next = [...amounts];
    next[i] = Math.max(0, parseInt(value) || 0);
    setAmounts(next);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveResidentTaxSchedule(employeeId, fiscalYear, amounts);
      toast.success("住民税の月別内訳を保存しました");
      onOpenChange(false);
    } catch {
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const total = amounts.reduce((a, b) => a + b, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>住民税 月別内訳 — {employeeName}</DialogTitle>
        </DialogHeader>

        {/* 年度ナビゲーション */}
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setFiscalYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium min-w-[200px] text-center">
            {fiscalYear}年度（{fiscalYear}年6月〜{fiscalYear + 1}年5月）
          </span>
          <Button variant="outline" size="icon" onClick={() => setFiscalYear((y) => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* 年税額＋自動配分 */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="annual_tax">年税額（円）</Label>
            <Input
              id="annual_tax"
              type="number"
              value={annualTax || ""}
              onChange={(e) => setAnnualTax(parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          <Button type="button" variant="outline" onClick={distribute}>
            自動配分
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          自動配分: 年税額÷12（100円未満切り捨て）、端数は6月分に加算。各月は手動で修正できます。
        </p>

        {/* 12ヶ月内訳 */}
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">読み込み中...</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {MONTH_LABELS.map((label, i) => (
              <div key={label} className="space-y-1">
                <Label className="text-xs">{label}分</Label>
                <Input
                  type="number"
                  value={amounts[i] || ""}
                  onChange={(e) => setAmount(i, e.target.value)}
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
        )}

        <div className="text-sm text-right">
          合計: <span className="font-bold">{total.toLocaleString()}円</span>
          {annualTax > 0 && total !== annualTax && (
            <span className="text-orange-600 ml-2">（年税額と{(total - annualTax).toLocaleString()}円の差）</span>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

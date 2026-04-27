"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  getPendingCorrections,
  approveCorrection,
  rejectCorrection,
  type CorrectionWithDetails,
} from "@/app/(dashboard)/attendance/correction-actions";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

function correctionTypeLabel(type: string) {
  switch (type) {
    case "clock_out":
      return "退勤修正";
    case "clock_in":
      return "出勤修正";
    case "both":
      return "出退勤修正";
    default:
      return type;
  }
}

export function CorrectionApprovalList() {
  const [corrections, setCorrections] = useState<CorrectionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getPendingCorrections();
      setCorrections(data);
    } catch {
      toast.error("修正申告の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(id: string) {
    setProcessingId(id);
    try {
      await approveCorrection(id);
      toast.success("承認しました");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "承認に失敗しました");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(id: string) {
    if (!confirm("この修正申告を却下しますか？")) return;
    setProcessingId(id);
    try {
      await rejectCorrection(id);
      toast.success("却下しました");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "却下に失敗しました");
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">読み込み中...</p>;
  }

  if (corrections.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        未処理の修正申告はありません
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>従業員</TableHead>
          <TableHead>対象日</TableHead>
          <TableHead>種別</TableHead>
          <TableHead>申告出勤時刻</TableHead>
          <TableHead>申告退勤時刻</TableHead>
          <TableHead>業務タイプ</TableHead>
          <TableHead>理由</TableHead>
          <TableHead>申告日時</TableHead>
          <TableHead className="w-[140px]">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {corrections.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">{c.employee_name}</TableCell>
            <TableCell>{c.work_date}</TableCell>
            <TableCell>
              <Badge variant="outline">{correctionTypeLabel(c.correction_type)}</Badge>
            </TableCell>
            <TableCell>
              {c.corrected_clock_in ? (
                <span className="font-mono">
                  {formatTime(c.corrected_clock_in)}
                  {c.original_clock_in && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (元: {formatTime(c.original_clock_in)})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              {c.corrected_clock_out ? (
                <span className="font-mono">
                  {formatTime(c.corrected_clock_out)}
                  {c.original_clock_out && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (元: {formatTime(c.original_clock_out)})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>{c.work_type_name || "-"}</TableCell>
            <TableCell className="max-w-[200px] truncate" title={c.reason}>
              {c.reason}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(c.created_at).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={() => handleApprove(c.id)}
                  disabled={processingId === c.id}
                >
                  承認
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReject(c.id)}
                  disabled={processingId === c.id}
                >
                  却下
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

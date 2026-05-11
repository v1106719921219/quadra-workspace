"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { toast } from "sonner";
import { getTimeRecordsForPeriod } from "./actions";
import {
  getCurrentPeriod,
  getNextPeriod,
  getPreviousPeriod,
  getDatesInPeriod,
  type ClosingPeriod,
} from "@/lib/closing-period";
import { roundUpToInterval, roundDownToInterval } from "@/lib/time-utils";

interface Employee {
  id: string;
  name: string;
  employee_number: string | null;
  employee_type: string;
}

interface TimeRecord {
  id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  is_driver: boolean;
  work_types: { name: string } | null;
  job_site_id: string | null;
  job_sites: { name: string; short_name: string | null } | null;
}

interface TenantSettings {
  closing_day: number;
  time_rounding_minutes: number;
}

const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export function TimecardClient({
  initialEmployees,
  initialSettings,
}: {
  initialEmployees: Employee[];
  initialSettings: TenantSettings;
}) {
  const [employees] = useState(initialEmployees);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialEmployees[0]?.id || "");
  const [period, setPeriod] = useState(() => getCurrentPeriod(initialSettings.closing_day));
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const closingDay = initialSettings.closing_day;
  const roundingMinutes = initialSettings.time_rounding_minutes;
  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);
  const isFullTime = selectedEmployee?.employee_type === "full_time";

  const loadRecords = useCallback(async (empId: string, p: ClosingPeriod) => {
    if (!empId) return;
    setLoading(true);
    try {
      const data = await getTimeRecordsForPeriod(empId, p.startDate, p.endDate);
      setRecords(data as unknown as TimeRecord[]);
    } catch {
      toast.error("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords(selectedEmployeeId, period);
  }, [selectedEmployeeId, period, loadRecords]);

  // 全日付リスト
  const allDates = useMemo(() => getDatesInPeriod(period), [period]);

  // レコードを日付でマップ
  const recordMap = useMemo(() => {
    const map = new Map<string, TimeRecord>();
    records.forEach((r) => map.set(r.work_date, r));
    return map;
  }, [records]);

  // 各日の計算結果
  const dailyData = useMemo(() => {
    let cumHours = 0;
    return allDates.map((dateStr) => {
      const d = new Date(dateStr + "T00:00:00+09:00");
      const dayOfWeek = d.getDay();
      const dayName = WEEKDAY_NAMES[dayOfWeek];
      const record = recordMap.get(dateStr);

      let clockInStr = "";
      let clockOutStr = "";
      let breakStr = "";
      let workHours = 0;
      let siteName = "";
      let isOff = true;

      if (record) {
        isOff = false;
        const clockIn = new Date(record.clock_in);
        clockInStr = formatTimeJST(clockIn);

        if (record.clock_out) {
          const clockOut = new Date(record.clock_out);
          clockOutStr = formatTimeJST(clockOut);

          // 15分丸め
          const roundedIn = roundUpToInterval(clockIn, roundingMinutes);
          const roundedOut = roundDownToInterval(clockOut, roundingMinutes);
          const diffMin = (roundedOut.getTime() - roundedIn.getTime()) / 60000 - record.break_minutes;
          workHours = Math.max(0, diffMin / 60);
          // 正社員は出勤すれば一律8時間扱い
          if (isFullTime) {
            workHours = 8;
          }
          // 0.25刻みに丸め
          workHours = Math.round(workHours * 4) / 4;
        }

        breakStr = record.break_minutes > 0 ? formatBreak(record.break_minutes) : "";

        const js = record.job_sites as { name: string; short_name: string | null } | null;
        siteName = js?.short_name || js?.name || "";
      }

      cumHours += workHours;

      return {
        date: dateStr,
        dayOfWeek,
        dayName,
        isOff,
        clockIn: clockInStr,
        clockOut: clockOutStr,
        breakTime: breakStr,
        workHours,
        cumHours,
        siteName,
        isDriver: record?.is_driver || false,
      };
    });
  }, [allDates, recordMap, roundingMinutes, isFullTime]);

  // 合計
  const totalHours = dailyData.length > 0 ? dailyData[dailyData.length - 1].cumHours : 0;
  const workDays = dailyData.filter((d) => !d.isOff).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">タイムカード</h1>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          印刷
        </Button>
      </div>

      {/* コントロール */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setPeriod(getPreviousPeriod(period, closingDay))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium min-w-[140px] text-center">{period.label}</span>
          <Button variant="outline" size="icon" onClick={() => setPeriod(getNextPeriod(period, closingDay))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="従業員を選択" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 期間表示 */}
      <div className="text-sm text-muted-foreground print:text-black">
        期間: {period.startDate} 〜 {period.endDate}
        {selectedEmployee && ` ・ 従業員: ${selectedEmployee.name}`}
      </div>

      {/* タイムカードテーブル */}
      <div className="border rounded-lg overflow-x-auto print:border-black">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b print:bg-gray-100">
              <th className="text-left p-2 w-[90px]">日付</th>
              <th className="text-left p-2 w-[40px]">曜日</th>
              <th className="text-left p-2">現場名</th>
              <th className="text-right p-2 w-[60px]">出勤</th>
              <th className="text-right p-2 w-[60px]">退勤</th>
              <th className="text-right p-2 w-[50px]">休憩</th>
              <th className="text-right p-2 w-[70px]">実働</th>
              <th className="text-right p-2 w-[70px]">累計</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center p-4 text-muted-foreground">読み込み中...</td>
              </tr>
            ) : (
              dailyData.map((day) => {
                const isSunday = day.dayOfWeek === 0;
                const isSaturday = day.dayOfWeek === 6;
                return (
                  <tr
                    key={day.date}
                    className={`border-b ${isSunday || isSaturday ? "bg-muted/20" : ""} ${day.isOff ? "text-muted-foreground" : ""}`}
                  >
                    <td className="p-2 font-mono text-xs">{day.date.slice(5)}</td>
                    <td className={`p-2 text-center ${isSunday ? "text-red-500 font-bold" : isSaturday ? "text-blue-500 font-bold" : ""}`}>
                      {day.dayName}
                    </td>
                    <td className="p-2">{day.siteName || (day.isOff ? "" : "")}</td>
                    <td className="p-2 text-right font-mono">
                      {day.isOff ? "" : day.clockIn || "-"}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {day.isOff ? "" : day.clockOut || "-"}
                    </td>
                    <td className="p-2 text-right font-mono">{day.breakTime}</td>
                    <td className="p-2 text-right font-mono">
                      {day.isOff ? (isSunday || isSaturday ? "休" : "") : day.workHours > 0 ? `${day.workHours.toFixed(2)}` : "-"}
                    </td>
                    <td className="p-2 text-right font-mono font-medium">
                      {day.cumHours > 0 ? `${day.cumHours.toFixed(2)}` : ""}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-bold border-t print:bg-gray-100">
              <td colSpan={6} className="p-2 text-right">
                出勤日数: {workDays}日
              </td>
              <td className="p-2 text-right">合計</td>
              <td className="p-2 text-right font-mono">{totalHours.toFixed(2)}h</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 印刷用CSS */}
      <style>{`
        @media print {
          nav, header, [data-sidebar], button, .no-print { display: none !important; }
          body { font-size: 10pt; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

function formatTimeJST(date: Date): string {
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

function formatBreak(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

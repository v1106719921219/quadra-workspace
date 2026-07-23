"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDayOffRequestsByMonth } from "./actions";
import { jstDayOfWeek } from "@/lib/time-utils";

interface DayOffRequest {
  id: string;
  employee_id: string;
  request_date: string;
  status: string;
  employees: { name: string } | null;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function DayOffRequestsClient({
  initialRequests,
  initialYear,
  initialMonth,
}: {
  initialRequests: DayOffRequest[];
  initialYear: number;
  initialMonth: number;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [requests, setRequests] = useState<DayOffRequest[]>(initialRequests);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const data = await getDayOffRequestsByMonth(y, m);
      setRequests(data as unknown as DayOffRequest[]);
    } finally {
      setLoading(false);
    }
  }, []);

  function prevMonth() {
    const y = month === 1 ? year - 1 : year;
    const m = month === 1 ? 12 : month - 1;
    setYear(y); setMonth(m); load(y, m);
  }

  function nextMonth() {
    const y = month === 12 ? year + 1 : year;
    const m = month === 12 ? 1 : month + 1;
    setYear(y); setMonth(m); load(y, m);
  }

  // 従業員ごとにグループ化
  const byEmployee = requests.reduce<Record<string, { name: string; dates: string[] }>>(
    (acc, r) => {
      const name = r.employees?.name ?? "不明";
      if (!acc[r.employee_id]) acc[r.employee_id] = { name, dates: [] };
      acc[r.employee_id].dates.push(r.request_date);
      return acc;
    },
    {}
  );

  // カレンダー生成: month は1始まり(1=1月)
  const firstDate = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = firstDate.getDay(); // 0=日, 1=月, ..., 6=土
  const calendarDays: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  // 日付→休日希望者名リスト
  const requestsByDate: Record<string, string[]> = {};
  requests.forEach((r) => {
    const day = parseInt(r.request_date.split("-")[2]);
    if (!requestsByDate[day]) requestsByDate[day] = [];
    if (r.employees?.name) requestsByDate[day].push(r.employees.name);
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">休日希望一覧</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth} disabled={loading}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-lg w-28 text-center">{year}年{month}月</span>
          <Button variant="outline" size="icon" onClick={nextMonth} disabled={loading}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {loading ? "読み込み中..." : "この月の休日希望はまだありません"}
        </div>
      ) : (
        <>
          {/* カレンダービュー */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-3">カレンダービュー</h2>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d, i) => (
                <div key={d} className={`text-center text-xs font-medium py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}>
                  {d}
                </div>
              ))}
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} />;
                const names = requestsByDate[day] || [];
                const weekday = new Date(year, month - 1, day).getDay();
                return (
                  <div
                    key={day}
                    className={`min-h-14 border rounded p-1 text-xs ${names.length > 0 ? "bg-red-50 border-red-200" : "bg-gray-50"}`}
                  >
                    <div className={`font-semibold mb-1 ${weekday === 0 ? "text-red-500" : weekday === 6 ? "text-blue-500" : ""}`}>
                      {day}
                    </div>
                    {names.map((name) => (
                      <div key={name} className="text-red-600 truncate">{name.slice(0, 3)}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 従業員別一覧 */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-3">従業員別</h2>
            <div className="space-y-3">
              {Object.entries(byEmployee).map(([id, { name, dates }]) => (
                <div key={id} className="flex items-start gap-4 py-2 border-b last:border-0">
                  <div className="w-24 font-medium text-sm shrink-0">{name}</div>
                  <div className="flex flex-wrap gap-1">
                    {dates.sort().map((d) => {
                      const weekday = WEEKDAYS[jstDayOfWeek(d)];
                      const day = parseInt(d.split("-")[2]);
                      return (
                        <span key={d} className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded">
                          {day}日({weekday})
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

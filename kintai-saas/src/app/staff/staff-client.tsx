"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { verifyPin, getDayOffRequests, getOthersDayOffRequests, saveDayOffRequests } from "./actions";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Employee {
  id: string;
  name: string;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function StaffClient({ employees }: { employees: Employee[] }) {
  const [step, setStep] = useState<"select" | "pin" | "calendar">("select");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);

  // カレンダー状態
  const now = new Date();
  const [year, setYear] = useState(now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 11 ? 1 : now.getMonth() + 2); // 翌月
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [othersRequests, setOthersRequests] = useState<Map<string, string[]>>(new Map()); // date -> names[]
  const [saved, setSaved] = useState(false);

  function handleSelectEmployee(emp: Employee) {
    setSelectedEmployee(emp);
    setPin("");
    setPinError(false);
    setStep("pin");
  }

  async function handlePinSubmit() {
    if (!selectedEmployee || pin.length < 4) return;
    setLoading(true);
    try {
      const ok = await verifyPin(selectedEmployee.id, pin);
      if (!ok) {
        setPinError(true);
        setPin("");
        setLoading(false);
        return;
      }
      // カレンダーデータ読み込み
      const [existing, others] = await Promise.all([
        getDayOffRequests(selectedEmployee.id, year, month),
        getOthersDayOffRequests(selectedEmployee.id, year, month),
      ]);
      const dates = new Set(existing.map((r) => r.request_date));
      setSelectedDates(dates);
      setOthersRequests(buildOthersMap(others));
      setSaved(false);
      setStep("calendar");
    } catch {
      toast.error("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  function toggleDate(dateStr: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!selectedEmployee) return;
    setLoading(true);
    try {
      const dates = Array.from(selectedDates);
      if (dates.length === 0) {
        // 全削除の場合：ダミー日付で月を特定して既存を削除
        const dummyDate = `${year}-${String(month).padStart(2, "0")}-01`;
        await saveDayOffRequests(selectedEmployee.id, [dummyDate]);
        // ダミーも削除するため再度空で呼ぶ
      } else {
        await saveDayOffRequests(selectedEmployee.id, dates);
      }
      setSaved(true);
      toast.success("休日希望を提出しました！");
    } catch {
      toast.error("保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildOthersMap(others: any[]) {
    const map = new Map<string, string[]>();
    for (const r of others) {
      const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
      const name = emp?.name || "?";
      const existing = map.get(r.request_date) || [];
      existing.push(name);
      map.set(r.request_date, existing);
    }
    return map;
  }

  async function handleMonthChange(newYear: number, newMonth: number) {
    setYear(newYear);
    setMonth(newMonth);
    setSaved(false);
    if (selectedEmployee) {
      setLoading(true);
      try {
        const [existing, others] = await Promise.all([
          getDayOffRequests(selectedEmployee.id, newYear, newMonth),
          getOthersDayOffRequests(selectedEmployee.id, newYear, newMonth),
        ]);
        setSelectedDates(new Set(existing.map((r) => r.request_date)));
        setOthersRequests(buildOthersMap(others));
      } catch {
        setSelectedDates(new Set());
        setOthersRequests(new Map());
      } finally {
        setLoading(false);
      }
    } else {
      setSelectedDates(new Set());
      setOthersRequests(new Map());
    }
  }

  // カレンダー生成
  function getCalendarDays() {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return days;
  }

  function prevMonth() {
    const newMonth = month === 1 ? 12 : month - 1;
    const newYear = month === 1 ? year - 1 : year;
    handleMonthChange(newYear, newMonth);
  }

  function nextMonth() {
    const newMonth = month === 12 ? 1 : month + 1;
    const newYear = month === 12 ? year + 1 : year;
    handleMonthChange(newYear, newMonth);
  }

  // ---- 画面：従業員選択 ----
  if (step === "select") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold mb-2">休日希望提出</h1>
        <p className="text-muted-foreground mb-6 text-sm">名前を選んでください</p>
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {employees.map((emp) => (
            <Button
              key={emp.id}
              variant="outline"
              className="h-14 text-base font-medium"
              onClick={() => handleSelectEmployee(emp)}
            >
              {emp.name}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // ---- 画面：PIN入力 ----
  if (step === "pin") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold mb-1">{selectedEmployee?.name}</h1>
        <p className="text-muted-foreground mb-6 text-sm">PINを入力してください</p>
        <div className="w-full max-w-xs space-y-3">
          <Input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            className="h-14 text-center text-2xl tracking-widest"
            placeholder="••••"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/[^0-9]/g, ""));
              setPinError(false);
            }}
            onFocus={(e) => e.target.select()}
          />
          {pinError && <p className="text-red-500 text-sm text-center">PINが違います</p>}
          <Button className="w-full h-12 text-base" onClick={handlePinSubmit} disabled={loading || pin.length < 4}>
            {loading ? "確認中..." : "確認"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setStep("select")}>
            戻る
          </Button>
        </div>
      </div>
    );
  }

  // ---- 画面：カレンダー ----
  const calendarDays = getCalendarDays();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">{selectedEmployee?.name}</h1>
          <Button variant="ghost" size="sm" onClick={() => setStep("select")}>終了</Button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">休みたい日をタップしてください</p>

        {/* 月ナビゲーション */}
        <div className="flex items-center justify-between mb-3">
          <Button variant="outline" size="icon" onClick={prevMonth} disabled={loading}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-bold text-lg">{year}年{month}月</span>
          <Button variant="outline" size="icon" onClick={nextMonth} disabled={loading}><ChevronRight className="h-4 w-4" /></Button>
        </div>

        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`text-center text-xs font-medium py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}>
              {d}
            </div>
          ))}
        </div>

        {/* カレンダー */}
        <div className="grid grid-cols-7 gap-1 mb-4">
          {calendarDays.map((dateStr, i) => {
            if (!dateStr) return <div key={i} />;
            const day = parseInt(dateStr.split("-")[2]);
            const weekday = new Date(dateStr).getDay();
            const isSelected = selectedDates.has(dateStr);
            const isToday = dateStr === new Date().toLocaleDateString("sv-SE");
            const othersNames = othersRequests.get(dateStr) || [];
            return (
              <button
                key={dateStr}
                onClick={() => toggleDate(dateStr)}
                disabled={loading}
                className={`
                  relative rounded-lg flex flex-col items-center justify-start pt-1 text-sm font-medium transition-colors min-h-[52px]
                  ${isSelected ? "bg-red-500 text-white" : "bg-white border"}
                  ${weekday === 0 && !isSelected ? "text-red-500" : ""}
                  ${weekday === 6 && !isSelected ? "text-blue-500" : ""}
                  ${isToday && !isSelected ? "border-2 border-gray-400" : ""}
                `}
              >
                <span>{day}</span>
                {othersNames.length > 0 && (
                  <span className={`text-[9px] leading-tight truncate w-full text-center ${isSelected ? "text-red-100" : "text-orange-500"}`}>
                    {othersNames.map(n => n.slice(0, 2)).join(",")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 選択中の日数 */}
        <p className="text-center text-sm text-muted-foreground mb-4">
          {selectedDates.size}日選択中
        </p>

        <Button
          className="w-full h-12 text-base"
          onClick={handleSave}
          disabled={loading || saved}
        >
          {loading ? "送信中..." : saved ? "提出済み" : "休日希望を提出する"}
        </Button>
      </div>
    </div>
  );
}

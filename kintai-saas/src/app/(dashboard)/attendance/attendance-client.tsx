"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Printer } from "lucide-react";
import {
  getTimeRecords,
  getMonthlyRecords,
  createManualRecord,
  deleteTimeRecord,
  updateTimeRecord,
} from "./actions";
import { toast } from "sonner";
import { roundUpToInterval, roundDownToInterval } from "@/lib/time-utils";
import { CorrectionApprovalList } from "@/components/correction-approval-list";
import { CorrectionRequestDialog } from "@/components/correction-request-dialog";

interface TimeRecord {
  id: string;
  employee_id: string;
  work_type_id: string;
  job_site_id: string | null;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  note: string | null;
  actual_hours_override: number | null;
  employees: { name: string; employee_type: string };
  work_types: { name: string; daily_allowance: number };
  job_sites: { name: string; short_name: string | null } | null;
}

interface Employee {
  id: string;
  name: string;
}

interface WorkType {
  id: string;
  name: string;
}

interface JobSite {
  id: string;
  name: string;
  short_name: string | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

function calcWorkHours(clockIn: string, clockOut: string | null, breakMinutes: number, roundingMin: number = 15) {
  if (!clockOut) return null;
  const roundedIn = roundUpToInterval(new Date(clockIn), roundingMin);
  const roundedOut = roundDownToInterval(new Date(clockOut), roundingMin);
  const diffMinutes = (roundedOut.getTime() - roundedIn.getTime()) / 60000 - breakMinutes;
  const hours = Math.max(0, diffMinutes / 60);
  return Math.round(hours * 4) / 4;
}

export function AttendanceClient({
  employees,
  workTypes,
  jobSites,
  roundingMinutes = 15,
}: {
  employees: Employee[];
  workTypes: WorkType[];
  jobSites: JobSite[];
  roundingMinutes?: number;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [monthRecords, setMonthRecords] = useState<TimeRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [monthLoaded, setMonthLoaded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<TimeRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);

  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);

  async function loadRecords(d: string) {
    setDate(d);
    try {
      const data = await getTimeRecords(d);
      setRecords(data as unknown as TimeRecord[]);
      setLoaded(true);
    } catch {
      toast.error("データの読み込みに失敗しました");
    }
  }

  async function loadMonthRecords(y: number, m: number) {
    setViewYear(y);
    setViewMonth(m);
    try {
      const data = await getMonthlyRecords(y, m);
      setMonthRecords(data as unknown as TimeRecord[]);
      setMonthLoaded(true);
    } catch {
      toast.error("データの読み込みに失敗しました");
    }
  }

  function changeDate(delta: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    loadRecords(d.toISOString().split("T")[0]);
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      await createManualRecord(formData);
      toast.success("記録を追加しました");
      setAddOpen(false);
      await loadRecords(date);
    } catch {
      toast.error("追加に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("この記録を削除しますか？")) return;
    try {
      await deleteTimeRecord(id);
      toast.success("記録を削除しました");
      await loadRecords(date);
    } catch {
      toast.error("削除に失敗しました");
    }
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editRecord) return;
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const clockInTime = formData.get("clock_in_time") as string;
      const clockOutTime = formData.get("clock_out_time") as string;
      const breakMin = parseInt(formData.get("break_minutes") as string) || 0;

      const useOverride = formData.get("use_override") === "on";
      const overrideVal = formData.get("actual_hours_override") as string;
      const actualHoursOverride = useOverride && overrideVal ? parseFloat(overrideVal) : null;

      const jobSiteId = formData.get("job_site_id") as string;
      await updateTimeRecord(editRecord.id, {
        clock_in: new Date(`${editRecord.work_date}T${clockInTime}:00+09:00`).toISOString(),
        clock_out: clockOutTime ? new Date(`${editRecord.work_date}T${clockOutTime}:00+09:00`).toISOString() : null,
        break_minutes: breakMin,
        work_type_id: formData.get("work_type_id") as string,
        job_site_id: jobSiteId || null,
        actual_hours_override: actualHoursOverride,
      });
      toast.success("記録を更新しました");
      setEditRecord(null);
      await loadRecords(date);
    } catch {
      toast.error("更新に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  const [monthFilterEmployee, setMonthFilterEmployee] = useState<string>("all");
  const [monthFilterSite, setMonthFilterSite] = useState<string>("all");

  // 月別レコードのフィルタリング
  const filteredMonthRecords = monthRecords.filter((r) => {
    if (monthFilterEmployee !== "all" && r.employee_id !== monthFilterEmployee) return false;
    if (monthFilterSite !== "all") {
      const siteId = r.job_site_id || "";
      if (siteId !== monthFilterSite) return false;
    }
    return true;
  });

  // 曜日文字列
  const dayOfWeekNames = ["日", "月", "火", "水", "木", "金", "土"];
  function formatDateWithDay(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00+09:00");
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dow = dayOfWeekNames[d.getDay()];
    return { display: `${m}/${day}（${dow}）`, dayOfWeek: d.getDay() };
  }

  function calcRoundedWorkMinutes(clockIn: string, clockOut: string | null, breakMinutes: number) {
    if (!clockOut) return 0;
    const roundedIn = roundUpToInterval(new Date(clockIn), roundingMinutes);
    const roundedOut = roundDownToInterval(new Date(clockOut), roundingMinutes);
    return Math.max(0, (roundedOut.getTime() - roundedIn.getTime()) / 60000 - breakMinutes);
  }

  function formatHoursMinutes(clockIn: string, clockOut: string | null, breakMinutes: number) {
    if (!clockOut) return "-";
    const workMinutes = calcRoundedWorkMinutes(clockIn, clockOut, breakMinutes);
    const h = Math.floor(workMinutes / 60);
    const m = Math.round(workMinutes % 60);
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  function formatOvertimeHM(clockIn: string, clockOut: string | null, breakMinutes: number) {
    if (!clockOut) return "-";
    const workMinutes = calcRoundedWorkMinutes(clockIn, clockOut, breakMinutes);
    const overtimeMinutes = Math.max(0, workMinutes - 480);
    if (overtimeMinutes <= 0) return "-";
    const h = Math.floor(overtimeMinutes / 60);
    const m = Math.round(overtimeMinutes % 60);
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  // 月別集計サマリ（フィルタ後）
  const monthSummary = (() => {
    const uniqueDates = new Set<string>();
    let totalMinutes = 0;
    let overtimeMinutes = 0;
    filteredMonthRecords.forEach((r) => {
      uniqueDates.add(r.work_date);
      if (r.clock_out) {
        if (r.actual_hours_override != null) {
          const overrideMin = r.actual_hours_override * 60;
          totalMinutes += overrideMin;
          overtimeMinutes += Math.max(0, overrideMin - 480);
        } else {
          const work = calcRoundedWorkMinutes(r.clock_in, r.clock_out, r.break_minutes);
          totalMinutes += work;
          overtimeMinutes += Math.max(0, work - 480);
        }
      }
    });
    return {
      days: uniqueDates.size,
      records: filteredMonthRecords.length,
      totalH: Math.floor(totalMinutes / 60),
      totalM: Math.round(totalMinutes % 60),
      overtimeH: Math.floor(overtimeMinutes / 60),
      overtimeM: Math.round(overtimeMinutes % 60),
    };
  })();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">勤怠一覧</h1>

      <Tabs defaultValue="daily" onValueChange={(v) => {
        if (v === "daily" && !loaded) loadRecords(date);
        if (v === "monthly" && !monthLoaded) loadMonthRecords(viewYear, viewMonth);
      }}>
        <TabsList>
          <TabsTrigger value="daily" onClick={() => { if (!loaded) loadRecords(date); }}>日別</TabsTrigger>
          <TabsTrigger value="monthly" onClick={() => { if (!monthLoaded) loadMonthRecords(viewYear, viewMonth); }}>月別</TabsTrigger>
          <TabsTrigger value="corrections">修正申告</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(e) => loadRecords(e.target.value)}
              className="w-auto"
            />
            <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex-1" />
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              手動追加
            </Button>
          </div>

          <div className="overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>従業員</TableHead>
                <TableHead>現場</TableHead>
                <TableHead>出勤</TableHead>
                <TableHead>退勤</TableHead>
                <TableHead className="hidden sm:table-cell">休憩</TableHead>
                <TableHead>実働</TableHead>
                <TableHead className="w-[80px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {loaded ? "この日の記録はありません" : "日付を選択してください"}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r) => {
                  const emp = r.employees as unknown as { name: string };
                  const js = r.job_sites as { name: string; short_name: string | null } | null;
                  const autoHours = calcWorkHours(r.clock_in, r.clock_out, r.break_minutes, roundingMinutes);
                  const hours = r.actual_hours_override != null ? r.actual_hours_override : autoHours;
                  const isOverridden = r.actual_hours_override != null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="text-muted-foreground">{js?.short_name || js?.name || "-"}</TableCell>
                      <TableCell>{formatTime(r.clock_in)}</TableCell>
                      <TableCell>
                        {r.clock_out ? formatTime(r.clock_out) : <Badge variant="default" className="bg-green-500">出勤中</Badge>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{r.break_minutes}分</TableCell>
                      <TableCell>
                        {hours !== null ? (
                          <span className={isOverridden ? "text-blue-600 font-medium" : ""}>
                            {Number(hours).toFixed(2)}h
                            {isOverridden && <span className="text-[10px] ml-0.5">✎</span>}
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditRecord(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => {
                const m = viewMonth - 1;
                if (m < 1) loadMonthRecords(viewYear - 1, 12);
                else loadMonthRecords(viewYear, m);
              }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold text-lg">
                {viewYear}年{viewMonth}月
                {monthFilterEmployee === "all" ? "（全従業員）" : `（${employees.find(e => e.id === monthFilterEmployee)?.name}）`}
              </span>
              <Button variant="outline" size="icon" onClick={() => {
                const m = viewMonth + 1;
                if (m > 12) loadMonthRecords(viewYear + 1, 1);
                else loadMonthRecords(viewYear, m);
              }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Select value={monthFilterEmployee} onValueChange={setMonthFilterEmployee}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="従業員" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全従業員</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={monthFilterSite} onValueChange={setMonthFilterSite}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="拠点" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての拠点</SelectItem>
                  {jobSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.short_name || s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" />
                印刷
              </Button>
            </div>
          </div>

          {/* 集計サマリ */}
          {monthLoaded && filteredMonthRecords.length > 0 && (
            <div className="flex gap-6 text-sm text-muted-foreground border rounded-lg p-3">
              <span>出勤日数: <strong className="text-foreground">{monthSummary.days}日</strong></span>
              <span>記録数: <strong className="text-foreground">{monthSummary.records}件</strong></span>
              <span>合計労働: <strong className="text-foreground">{monthSummary.totalH}:{String(monthSummary.totalM).padStart(2, "0")}</strong></span>
              <span>合計残業: <strong className="text-foreground">{monthSummary.overtimeH}:{String(monthSummary.overtimeM).padStart(2, "0")}</strong></span>
            </div>
          )}

          <div className="overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead>従業員</TableHead>
                <TableHead>日付</TableHead>
                <TableHead>出勤</TableHead>
                <TableHead>退勤</TableHead>
                <TableHead>休憩</TableHead>
                <TableHead>労働時間</TableHead>
                <TableHead>残業</TableHead>
                <TableHead>状態</TableHead>
                <TableHead className="w-[50px]">編集</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMonthRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {monthLoaded ? "この月の記録はありません" : "読み込み中..."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredMonthRecords.map((r) => {
                  const emp = r.employees as unknown as { name: string };
                  const { display, dayOfWeek } = formatDateWithDay(r.work_date);
                  const overtime = formatOvertimeHM(r.clock_in, r.clock_out, r.break_minutes);
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const isOverridden = r.actual_hours_override != null;
                  const displayHours = isOverridden
                    ? (() => { const h = Math.floor(r.actual_hours_override!); const m = Math.round((r.actual_hours_override! - h) * 60); return `${h}:${String(m).padStart(2, "0")}`; })()
                    : formatHoursMinutes(r.clock_in, r.clock_out, r.break_minutes);
                  return (
                    <TableRow key={r.id} className={isWeekend ? "bg-muted/30" : ""}>
                      <TableCell className="font-medium whitespace-nowrap">{emp.name}</TableCell>
                      <TableCell className={`whitespace-nowrap ${dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : ""}`}>
                        {display}
                      </TableCell>
                      <TableCell>{formatTime(r.clock_in)}</TableCell>
                      <TableCell>
                        {r.clock_out ? formatTime(r.clock_out) : <Badge variant="default" className="bg-green-500">出勤中</Badge>}
                      </TableCell>
                      <TableCell>{r.break_minutes > 0 ? `${Math.floor(r.break_minutes / 60)}:${String(r.break_minutes % 60).padStart(2, "0")}` : "0:00"}</TableCell>
                      <TableCell className={isOverridden ? "text-blue-600 font-medium" : ""}>{displayHours}{isOverridden && <span className="text-[10px] ml-0.5">✎</span>}</TableCell>
                      <TableCell className={overtime !== "-" ? "text-red-500 font-medium" : ""}>
                        {overtime}
                      </TableCell>
                      <TableCell>
                        {r.clock_out ? (
                          <Badge variant="default" className="bg-green-600 text-[11px]">完了</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px]">出勤中</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditRecord(r);
                          setDate(r.work_date);
                        }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </TabsContent>

        <TabsContent value="corrections" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCorrectionOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              修正申告する
            </Button>
          </div>
          <CorrectionApprovalList />
        </TabsContent>
      </Tabs>

      {/* 手動追加ダイアログ */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>勤怠記録の手動追加</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>従業員</Label>
              <Select name="employee_id" required>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>現場</Label>
              <Select name="job_site_id">
                <SelectTrigger><SelectValue placeholder="未設定" /></SelectTrigger>
                <SelectContent>
                  {jobSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>日付</Label>
              <Input name="work_date" type="date" defaultValue={date} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>出勤時間</Label>
                <Input name="clock_in_time" type="time" required />
              </div>
              <div className="space-y-2">
                <Label>退勤時間</Label>
                <Input name="clock_out_time" type="time" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>休憩（分）</Label>
              <Input name="break_minutes" type="number" defaultValue={0} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>キャンセル</Button>
              <Button type="submit" disabled={loading}>{loading ? "追加中..." : "追加"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 編集ダイアログ */}
      <Dialog open={!!editRecord} onOpenChange={(open) => !open && setEditRecord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>勤怠記録の編集</DialogTitle>
          </DialogHeader>
          {editRecord && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-2">
                <Label>現場</Label>
                <Select name="job_site_id" defaultValue={editRecord.job_site_id ?? ""}>
                  <SelectTrigger><SelectValue placeholder="未設定" /></SelectTrigger>
                  <SelectContent>
                    {jobSites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>出勤時間</Label>
                  <Input
                    name="clock_in_time"
                    type="time"
                    defaultValue={formatTime(editRecord.clock_in)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>退勤時間</Label>
                  <Input
                    name="clock_out_time"
                    type="time"
                    defaultValue={editRecord.clock_out ? formatTime(editRecord.clock_out) : ""}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>休憩（分）</Label>
                <Input name="break_minutes" type="number" defaultValue={editRecord.break_minutes} />
              </div>
              <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="use_override"
                    id="use_override"
                    defaultChecked={editRecord.actual_hours_override != null}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="use_override" className="text-sm font-medium">実働時間を手動で設定</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    name="actual_hours_override"
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    placeholder="例: 7.5"
                    defaultValue={editRecord.actual_hours_override ?? ""}
                    className="w-[120px]"
                  />
                  <span className="text-sm text-muted-foreground">時間（0.25刻み）</span>
                </div>
                <p className="text-xs text-muted-foreground">チェックを入れると自動計算を上書きします</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditRecord(null)}>キャンセル</Button>
                <Button type="submit" disabled={loading}>{loading ? "更新中..." : "更新"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* 修正申告ダイアログ */}
      <CorrectionRequestDialog
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        mode="both"
        employees={employees}
        workTypes={workTypes}
      />
    </div>
  );
}

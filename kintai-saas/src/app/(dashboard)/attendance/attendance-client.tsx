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
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil } from "lucide-react";
import {
  getTimeRecords,
  getMonthlyRecords,
  createManualRecord,
  deleteTimeRecord,
  updateTimeRecord,
} from "./actions";
import { toast } from "sonner";

interface TimeRecord {
  id: string;
  employee_id: string;
  work_type_id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  note: string | null;
  employees: { name: string; employee_type: string };
  work_types: { name: string; daily_allowance: number };
}

interface Employee {
  id: string;
  name: string;
}

interface WorkType {
  id: string;
  name: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function calcWorkHours(clockIn: string, clockOut: string | null, breakMinutes: number) {
  if (!clockOut) return null;
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 1000 / 60;
  const workMinutes = diff - breakMinutes;
  return Math.max(0, workMinutes / 60);
}

export function AttendanceClient({
  employees,
  workTypes,
}: {
  employees: Employee[];
  workTypes: WorkType[];
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

      await updateTimeRecord(editRecord.id, {
        clock_in: new Date(`${editRecord.work_date}T${clockInTime}:00+09:00`).toISOString(),
        clock_out: clockOutTime ? new Date(`${editRecord.work_date}T${clockOutTime}:00+09:00`).toISOString() : null,
        break_minutes: breakMin,
        work_type_id: formData.get("work_type_id") as string,
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

  // 月別の集計
  const monthlyByEmployee = new Map<string, { name: string; days: number; totalHours: number; records: number }>();
  monthRecords.forEach((r) => {
    const emp = r.employees as unknown as { name: string };
    const key = r.employee_id;
    if (!monthlyByEmployee.has(key)) {
      monthlyByEmployee.set(key, { name: emp.name, days: 0, totalHours: 0, records: 0 });
    }
    const entry = monthlyByEmployee.get(key)!;
    entry.records++;
    const hours = calcWorkHours(r.clock_in, r.clock_out, r.break_minutes);
    if (hours !== null) {
      entry.totalHours += hours;
    }
  });
  // 日数計算（ユニークなwork_dateの数）
  const datesByEmployee = new Map<string, Set<string>>();
  monthRecords.forEach((r) => {
    if (!datesByEmployee.has(r.employee_id)) {
      datesByEmployee.set(r.employee_id, new Set());
    }
    datesByEmployee.get(r.employee_id)!.add(r.work_date);
  });
  datesByEmployee.forEach((dates, empId) => {
    const entry = monthlyByEmployee.get(empId);
    if (entry) entry.days = dates.size;
  });

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

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>従業員</TableHead>
                <TableHead>業務タイプ</TableHead>
                <TableHead>出勤</TableHead>
                <TableHead>退勤</TableHead>
                <TableHead>休憩</TableHead>
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
                  const wt = r.work_types as unknown as { name: string };
                  const hours = calcWorkHours(r.clock_in, r.clock_out, r.break_minutes);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell>{wt.name}</TableCell>
                      <TableCell>{formatTime(r.clock_in)}</TableCell>
                      <TableCell>
                        {r.clock_out ? formatTime(r.clock_out) : <Badge variant="default" className="bg-green-500">出勤中</Badge>}
                      </TableCell>
                      <TableCell>{r.break_minutes}分</TableCell>
                      <TableCell>
                        {hours !== null ? `${hours.toFixed(1)}h` : "-"}
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
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => {
              const m = viewMonth - 1;
              if (m < 1) loadMonthRecords(viewYear - 1, 12);
              else loadMonthRecords(viewYear, m);
            }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium">{viewYear}年{viewMonth}月</span>
            <Button variant="outline" size="icon" onClick={() => {
              const m = viewMonth + 1;
              if (m > 12) loadMonthRecords(viewYear + 1, 1);
              else loadMonthRecords(viewYear, m);
            }}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>従業員</TableHead>
                <TableHead>出勤日数</TableHead>
                <TableHead>合計時間</TableHead>
                <TableHead>記録数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyByEmployee.size === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    この月の記録はありません
                  </TableCell>
                </TableRow>
              ) : (
                Array.from(monthlyByEmployee.entries()).map(([empId, data]) => (
                  <TableRow key={empId}>
                    <TableCell className="font-medium">{data.name}</TableCell>
                    <TableCell>{data.days}日</TableCell>
                    <TableCell>{data.totalHours.toFixed(1)}h</TableCell>
                    <TableCell>{data.records}件</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
              <Label>業務タイプ</Label>
              <Select name="work_type_id" required>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent>
                  {workTypes.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
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
                <Label>業務タイプ</Label>
                <Select name="work_type_id" defaultValue={editRecord.work_type_id}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {workTypes.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditRecord(null)}>キャンセル</Button>
                <Button type="submit" disabled={loading}>{loading ? "更新中..." : "更新"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

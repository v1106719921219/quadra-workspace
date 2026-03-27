"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ChevronLeft, ChevronRight, Copy, Trash2, Plus, Pencil, GripVertical } from "lucide-react";
import {
  getWeeklyShifts,
  upsertShift,
  deleteShift,
  copyPreviousWeek,
  getShiftTemplates,
  createShiftTemplate,
  updateShiftTemplate,
  deleteShiftTemplate,
} from "./actions";
import { toast } from "sonner";

interface Employee {
  id: string;
  name: string;
}

interface WorkType {
  id: string;
  name: string;
}

interface Shift {
  id: string;
  employee_id: string;
  work_type_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  note: string | null;
  employees: { name: string };
  work_types: { name: string };
}

interface ShiftTemplate {
  id: string;
  name: string;
  work_type_id: string;
  start_time: string;
  end_time: string;
  color: string;
  sort_order: number;
  work_types: { name: string };
}

// 週の月曜日を取得
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

const TEMPLATE_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

export function ShiftsClient({
  employees,
  workTypes,
  shiftTemplates: initialTemplates,
}: {
  employees: Employee[];
  workTypes: WorkType[];
  shiftTemplates: ShiftTemplate[];
}) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    employeeId: string;
    date: string;
    shift?: Shift;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // テンプレート関連
  const [templates, setTemplates] = useState<ShiftTemplate[]>(initialTemplates);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWeeklyShifts(formatDate(weekStart));
      setShifts(data as unknown as Shift[]);
    } catch {
      toast.error("シフトの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  function getShiftForCell(employeeId: string, date: string): Shift | undefined {
    return shifts.find(
      (s) => s.employee_id === employeeId && s.shift_date === date
    );
  }

  function handleCellClick(employeeId: string, date: string) {
    const shift = getShiftForCell(employeeId, date);
    setSelectedCell({ employeeId, date, shift });
    setDialogOpen(true);
  }

  function changeWeek(delta: number) {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedCell) return;
    setSaving(true);
    try {
      const form = new FormData(e.currentTarget);
      await upsertShift({
        id: selectedCell.shift?.id,
        employee_id: selectedCell.employeeId,
        work_type_id: form.get("work_type_id") as string,
        shift_date: selectedCell.date,
        start_time: form.get("start_time") as string,
        end_time: form.get("end_time") as string,
        note: (form.get("note") as string) || undefined,
      });
      toast.success("シフトを保存しました");
      setDialogOpen(false);
      await loadShifts();
    } catch {
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedCell?.shift) return;
    if (!confirm("このシフトを削除しますか？")) return;
    try {
      await deleteShift(selectedCell.shift.id);
      toast.success("シフトを削除しました");
      setDialogOpen(false);
      await loadShifts();
    } catch {
      toast.error("削除に失敗しました");
    }
  }

  async function handleCopyPrevWeek() {
    if (!confirm("前週のシフトを今週にコピーしますか？\n既存のシフトは上書きされます。")) return;
    try {
      await copyPreviousWeek(formatDate(weekStart));
      toast.success("前週のシフトをコピーしました");
      await loadShifts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "コピーに失敗しました");
    }
  }

  // ── テンプレート管理 ──

  function handleAddTemplate() {
    setEditingTemplate(null);
    setTemplateDialogOpen(true);
  }

  function handleEditTemplate(template: ShiftTemplate) {
    setEditingTemplate(template);
    setTemplateDialogOpen(true);
  }

  async function handleDeleteTemplate(template: ShiftTemplate) {
    if (!confirm(`「${template.name}」を削除しますか？`)) return;
    try {
      await deleteShiftTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      toast.success("テンプレートを削除しました");
    } catch {
      toast.error("削除に失敗しました");
    }
  }

  async function handleTemplateSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTemplateSaving(true);
    try {
      const form = new FormData(e.currentTarget);
      const data = {
        name: form.get("template_name") as string,
        work_type_id: form.get("template_work_type_id") as string,
        start_time: form.get("template_start_time") as string,
        end_time: form.get("template_end_time") as string,
        color: form.get("template_color") as string,
      };

      if (editingTemplate) {
        await updateShiftTemplate(editingTemplate.id, data);
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === editingTemplate.id
              ? {
                  ...t,
                  ...data,
                  work_types: {
                    name: workTypes.find((w) => w.id === data.work_type_id)?.name || "",
                  },
                }
              : t
          )
        );
        toast.success("テンプレートを更新しました");
      } else {
        await createShiftTemplate(data);
        const res = await getShiftTemplates();
        setTemplates(res as unknown as ShiftTemplate[]);
        toast.success("テンプレートを作成しました");
      }
      setTemplateDialogOpen(false);
    } catch (err) {
      console.error("テンプレート保存エラー:", err);
      toast.error("保存に失敗しました");
    } finally {
      setTemplateSaving(false);
    }
  }

  // ── ドラッグ&ドロップ ──

  function handleDragStart(e: React.DragEvent, template: ShiftTemplate) {
    e.dataTransfer.setData("application/shift-template", JSON.stringify(template));
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleDragOver(e: React.DragEvent, cellKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverCell(cellKey);
  }

  function handleDragLeave() {
    setDragOverCell(null);
  }

  async function handleDrop(e: React.DragEvent, employeeId: string, date: string) {
    e.preventDefault();
    setDragOverCell(null);

    const raw = e.dataTransfer.getData("application/shift-template");
    if (!raw) return;

    try {
      const template: ShiftTemplate = JSON.parse(raw);
      const existing = getShiftForCell(employeeId, date);

      await upsertShift({
        id: existing?.id,
        employee_id: employeeId,
        work_type_id: template.work_type_id,
        shift_date: date,
        start_time: template.start_time.slice(0, 5),
        end_time: template.end_time.slice(0, 5),
      });
      toast.success("シフトを登録しました");
      await loadShifts();
    } catch {
      toast.error("登録に失敗しました");
    }
  }

  // 週の表示ラベル
  const weekLabel = `${weekDates[0].getMonth() + 1}/${weekDates[0].getDate()} 〜 ${weekDates[6].getMonth() + 1}/${weekDates[6].getDate()}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">シフト管理</h1>
        <Button variant="outline" onClick={handleCopyPrevWeek}>
          <Copy className="h-4 w-4 mr-2" />
          前週コピー
        </Button>
      </div>

      {/* 週ナビゲーション */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => changeWeek(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium min-w-[140px] text-center">{weekLabel}</span>
        <Button variant="outline" size="icon" onClick={() => changeWeek(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeekStart(getMonday(new Date()))}
        >
          今週
        </Button>
      </div>

      {/* メインエリア: テンプレートパネル + シフトグリッド */}
      <div className="flex gap-4">
        {/* テンプレートパネル */}
        <div className="w-48 shrink-0 space-y-3">
          <div className="text-sm font-semibold text-muted-foreground">テンプレート</div>

          {templates.length === 0 && (
            <p className="text-xs text-muted-foreground">テンプレートなし</p>
          )}

          {templates.map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => handleDragStart(e, t)}
              className="group relative rounded-md border p-2 cursor-grab active:cursor-grabbing select-none hover:shadow-sm transition-shadow"
              style={{ borderLeftWidth: 4, borderLeftColor: t.color }}
            >
              <div className="flex items-center gap-1">
                <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.start_time.slice(0, 5)}-{t.end_time.slice(0, 5)}
                  </div>
                </div>
              </div>
              {/* 編集/削除ボタン */}
              <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleEditTemplate(t)}
                  className="p-0.5 rounded hover:bg-muted"
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(t)}
                  className="p-0.5 rounded hover:bg-muted"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleAddTemplate}
          >
            <Plus className="h-4 w-4 mr-1" />
            テンプレ追加
          </Button>
        </div>

        {/* シフトグリッド */}
        <div className="flex-1 border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background min-w-[100px]">
                  従業員
                </TableHead>
                {weekDates.map((d, i) => {
                  const isToday = formatDate(d) === formatDate(new Date());
                  const isSat = i === 5;
                  const isSun = i === 6;
                  return (
                    <TableHead
                      key={i}
                      className={`text-center min-w-[100px] ${
                        isToday ? "bg-blue-50 dark:bg-blue-950" : ""
                      } ${isSat ? "text-blue-600" : ""} ${isSun ? "text-red-600" : ""}`}
                    >
                      <div>{DAY_LABELS[i]}</div>
                      <div className="text-xs font-normal">
                        {d.getMonth() + 1}/{d.getDate()}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground"
                  >
                    従業員が登録されていません
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="sticky left-0 bg-background font-medium">
                      {emp.name}
                    </TableCell>
                    {weekDates.map((d, i) => {
                      const dateStr = formatDate(d);
                      const shift = getShiftForCell(emp.id, dateStr);
                      const isToday = dateStr === formatDate(new Date());
                      const cellKey = `${emp.id}-${dateStr}`;
                      const isDragOver = dragOverCell === cellKey;
                      return (
                        <TableCell
                          key={i}
                          className={`text-center cursor-pointer hover:bg-muted/50 transition-colors p-1 ${
                            isToday ? "bg-blue-50 dark:bg-blue-950" : ""
                          } ${isDragOver ? "bg-primary/10 ring-2 ring-primary ring-inset" : ""}`}
                          onClick={() => handleCellClick(emp.id, dateStr)}
                          onDragOver={(e) => handleDragOver(e, cellKey)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, emp.id, dateStr)}
                        >
                          {shift ? (
                            <div className="text-xs space-y-0.5">
                              <div className="font-medium">
                                {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
                              </div>
                              <div className="text-muted-foreground truncate">
                                {(shift.work_types as unknown as { name: string }).name}
                              </div>
                            </div>
                          ) : (
                            <div className="text-muted-foreground text-xs">--</div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground text-center">読み込み中...</p>
      )}

      {/* シフト追加/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedCell?.shift ? "シフト編集" : "シフト追加"}
              {selectedCell && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {employees.find((e) => e.id === selectedCell.employeeId)?.name} -{" "}
                  {selectedCell.date}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedCell && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label>業務タイプ</Label>
                <Select
                  name="work_type_id"
                  defaultValue={selectedCell.shift?.work_type_id}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {workTypes.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>開始時間</Label>
                  <Input
                    name="start_time"
                    type="time"
                    defaultValue={selectedCell.shift?.start_time?.slice(0, 5) || "09:00"}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>終了時間</Label>
                  <Input
                    name="end_time"
                    type="time"
                    defaultValue={selectedCell.shift?.end_time?.slice(0, 5) || "17:00"}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>メモ</Label>
                <Input
                  name="note"
                  defaultValue={selectedCell.shift?.note || ""}
                  placeholder="任意"
                />
              </div>
              <DialogFooter>
                {selectedCell.shift && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    className="mr-auto"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    削除
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  キャンセル
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "保存中..." : "保存"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* テンプレート追加/編集ダイアログ */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "テンプレート編集" : "テンプレート追加"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTemplateSave} className="space-y-4">
            <div className="space-y-2">
              <Label>テンプレート名</Label>
              <Input
                name="template_name"
                defaultValue={editingTemplate?.name || ""}
                placeholder="例: 早番"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>業務タイプ</Label>
              <Select
                name="template_work_type_id"
                defaultValue={editingTemplate?.work_type_id}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent>
                  {workTypes.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>開始時間</Label>
                <Input
                  name="template_start_time"
                  type="time"
                  defaultValue={editingTemplate?.start_time?.slice(0, 5) || "09:00"}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>終了時間</Label>
                <Input
                  name="template_end_time"
                  type="time"
                  defaultValue={editingTemplate?.end_time?.slice(0, 5) || "17:00"}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>表示色</Label>
              <div className="flex gap-2 flex-wrap">
                {TEMPLATE_COLORS.map((color) => (
                  <label key={color} className="cursor-pointer">
                    <input
                      type="radio"
                      name="template_color"
                      value={color}
                      defaultChecked={
                        editingTemplate
                          ? editingTemplate.color === color
                          : color === "#3b82f6"
                      }
                      className="sr-only peer"
                    />
                    <div
                      className="w-8 h-8 rounded-full border-2 border-transparent peer-checked:border-foreground peer-checked:ring-2 peer-checked:ring-offset-2 peer-checked:ring-primary transition-all"
                      style={{ backgroundColor: color }}
                    />
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTemplateDialogOpen(false)}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={templateSaving}>
                {templateSaving ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { createWorkType, updateWorkType, deleteWorkType } from "./actions";
import { toast } from "sonner";

interface WorkType {
  id: string;
  name: string;
  daily_allowance: number;
  sort_order: number;
  is_active: boolean;
}

export function WorkTypesClient({ workTypes }: { workTypes: WorkType[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkType | null>(null);
  const [loading, setLoading] = useState(false);

  function handleAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function handleEdit(wt: WorkType) {
    setEditing(wt);
    setFormOpen(true);
  }

  async function handleDelete(wt: WorkType) {
    if (!confirm(`「${wt.name}」を削除しますか？`)) return;
    try {
      await deleteWorkType(wt.id);
      toast.success("業務タイプを削除しました");
    } catch {
      toast.error("削除に失敗しました（使用中の可能性があります）");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      if (editing) {
        formData.set("is_active", String(editing.is_active));
        await updateWorkType(editing.id, formData);
        toast.success("業務タイプを更新しました");
      } else {
        await createWorkType(formData);
        toast.success("業務タイプを追加しました");
      }
      setFormOpen(false);
    } catch {
      toast.error("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">業務タイプ設定</h1>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          業務タイプ追加
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>表示順</TableHead>
            <TableHead>名前</TableHead>
            <TableHead>日当手当</TableHead>
            <TableHead>状態</TableHead>
            <TableHead className="w-[100px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workTypes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                業務タイプが登録されていません
              </TableCell>
            </TableRow>
          ) : (
            workTypes.map((wt) => (
              <TableRow key={wt.id}>
                <TableCell>{wt.sort_order}</TableCell>
                <TableCell className="font-medium">{wt.name}</TableCell>
                <TableCell>
                  {wt.daily_allowance > 0
                    ? `+¥${wt.daily_allowance.toLocaleString()}/日`
                    : "なし"
                  }
                </TableCell>
                <TableCell>
                  <Badge variant={wt.is_active ? "default" : "secondary"}>
                    {wt.is_active ? "有効" : "無効"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(wt)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(wt)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "業務タイプ編集" : "業務タイプ追加"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">名前</Label>
              <Input id="name" name="name" defaultValue={editing?.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="daily_allowance">日当手当（円/日）</Label>
              <Input
                id="daily_allowance"
                name="daily_allowance"
                type="number"
                defaultValue={editing?.daily_allowance ?? 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">表示順</Label>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                defaultValue={editing?.sort_order ?? 0}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                キャンセル
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "保存中..." : "保存"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

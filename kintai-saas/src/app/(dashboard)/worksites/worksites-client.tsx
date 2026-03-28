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
import { createWorksite, updateWorksite, deleteWorksite } from "./actions";
import { toast } from "sonner";

interface Worksite {
  id: string;
  name: string;
  short_name: string | null;
  sort_order: number;
  is_active: boolean;
}

export function WorksitesClient({ worksites }: { worksites: Worksite[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Worksite | null>(null);
  const [loading, setLoading] = useState(false);

  function handleAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function handleEdit(ws: Worksite) {
    setEditing(ws);
    setFormOpen(true);
  }

  async function handleDelete(ws: Worksite) {
    if (!confirm(`「${ws.name}」を削除しますか？`)) return;
    try {
      await deleteWorksite(ws.id);
      toast.success("現場を削除しました");
    } catch {
      toast.error("削除に失敗しました");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      if (editing) {
        formData.set("is_active", String(editing.is_active));
        await updateWorksite(editing.id, formData);
        toast.success("現場を更新しました");
      } else {
        await createWorksite(formData);
        toast.success("現場を追加しました");
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
        <h1 className="text-2xl font-bold">現場管理</h1>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          現場追加
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>表示順</TableHead>
            <TableHead>現場名</TableHead>
            <TableHead>略称</TableHead>
            <TableHead>状態</TableHead>
            <TableHead className="w-[100px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {worksites.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                現場が登録されていません
              </TableCell>
            </TableRow>
          ) : (
            worksites.map((ws) => (
              <TableRow key={ws.id}>
                <TableCell>{ws.sort_order}</TableCell>
                <TableCell className="font-medium">{ws.name}</TableCell>
                <TableCell className="text-muted-foreground">{ws.short_name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={ws.is_active ? "default" : "secondary"}>
                    {ws.is_active ? "有効" : "無効"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(ws)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(ws)}>
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
            <DialogTitle>{editing ? "現場編集" : "現場追加"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">現場名</Label>
              <Input id="name" name="name" defaultValue={editing?.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="short_name">略称（任意）</Label>
              <Input id="short_name" name="short_name" defaultValue={editing?.short_name ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">表示順</Label>
              <Input
                id="sort_order"
                name="sort_order"
                type="text"
                inputMode="numeric"
                onFocus={(e) => e.target.select()}
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

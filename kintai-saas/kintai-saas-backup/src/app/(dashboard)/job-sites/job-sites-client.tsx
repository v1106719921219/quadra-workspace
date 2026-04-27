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
import { createJobSite, updateJobSite, deleteJobSite } from "./actions";
import { toast } from "sonner";

interface JobSite {
  id: string;
  name: string;
  short_name: string | null;
  address: string | null;
  client_name: string | null;
  note: string | null;
  color: string;
  is_active: boolean;
  sort_order: number;
  hourly_rate: number | null;
  daily_allowance: number | null;
}

export function JobSitesClient({ jobSites }: { jobSites: JobSite[] }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JobSite | null>(null);
  const [loading, setLoading] = useState(false);

  function handleAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function handleEdit(site: JobSite) {
    setEditing(site);
    setFormOpen(true);
  }

  async function handleDelete(site: JobSite) {
    if (!confirm(`「${site.name}」を削除しますか？`)) return;
    try {
      await deleteJobSite(site.id);
      toast.success("現場を削除しました");
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
        await updateJobSite(editing.id, formData);
        toast.success("現場を更新しました");
      } else {
        await createJobSite(formData);
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
            <TableHead className="w-[60px]">順</TableHead>
            <TableHead>現場名</TableHead>
            <TableHead>略称</TableHead>
            <TableHead>元請・施主</TableHead>
            <TableHead>住所</TableHead>
            <TableHead>時給（パート）</TableHead>
            <TableHead>日当加算（正社員）</TableHead>
            <TableHead>状態</TableHead>
            <TableHead className="w-[100px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobSites.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                現場が登録されていません
              </TableCell>
            </TableRow>
          ) : (
            jobSites.map((site) => (
              <TableRow key={site.id}>
                <TableCell>{site.sort_order}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: site.color }}
                    />
                    <span className="font-medium">{site.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{site.short_name || "-"}</TableCell>
                <TableCell>{site.client_name || "-"}</TableCell>
                <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                  {site.address || "-"}
                </TableCell>
                <TableCell className="text-right">
                  {site.hourly_rate != null ? `¥${site.hourly_rate.toLocaleString()}` : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {site.daily_allowance != null ? `¥${site.daily_allowance.toLocaleString()}` : "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={site.is_active ? "default" : "secondary"}>
                    {site.is_active ? "稼働中" : "停止"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(site)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(site)}>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "現場編集" : "現場追加"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">現場名 *</Label>
                <Input id="name" name="name" defaultValue={editing?.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="short_name">略称</Label>
                <Input
                  id="short_name"
                  name="short_name"
                  defaultValue={editing?.short_name || ""}
                  placeholder="配置表用"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_name">元請・施主名</Label>
              <Input
                id="client_name"
                name="client_name"
                defaultValue={editing?.client_name || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">住所</Label>
              <Input
                id="address"
                name="address"
                defaultValue={editing?.address || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">備考</Label>
              <Input
                id="note"
                name="note"
                defaultValue={editing?.note || ""}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">時給（パート用・円）</Label>
                <Input
                  id="hourly_rate"
                  name="hourly_rate"
                  type="text"
                  inputMode="numeric"
                  onFocus={(e) => e.target.select()}
                  defaultValue={editing?.hourly_rate ?? ""}
                  placeholder="例: 1000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily_allowance">日当加算（正社員用・円）</Label>
                <Input
                  id="daily_allowance"
                  name="daily_allowance"
                  type="text"
                  inputMode="numeric"
                  onFocus={(e) => e.target.select()}
                  defaultValue={editing?.daily_allowance ?? ""}
                  placeholder="例: 1000"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="color">色</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="color"
                    name="color"
                    defaultValue={editing?.color || "#3b82f6"}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                </div>
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

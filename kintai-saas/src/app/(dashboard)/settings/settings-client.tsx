"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2 } from "lucide-react";
import { updateTenantSettings, updateCompanyInfo, updateMemberRole, removeMember } from "./actions";
import { toast } from "sonner";

interface TenantSettings {
  closing_day: number;
  timezone: string;
  company_address: string | null;
  company_phone: string | null;
}

interface Member {
  id: string;
  role: string;
  user_id: string;
  profiles: { email: string; full_name: string | null };
}

export function SettingsClient({
  settings,
  members,
}: {
  settings: TenantSettings | null;
  members: Member[];
}) {
  const [loading, setLoading] = useState(false);

  async function handleSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      await updateTenantSettings(formData);
      toast.success("設定を保存しました");
    } catch {
      toast.error("保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCompanyInfo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      await updateCompanyInfo(formData);
      toast.success("会社情報を保存しました");
    } catch {
      toast.error("保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(memberId: string, role: string) {
    try {
      await updateMemberRole(memberId, role);
      toast.success("ロールを更新しました");
    } catch {
      toast.error("更新に失敗しました");
    }
  }

  async function handleRemoveMember(member: Member) {
    const profile = member.profiles as unknown as { email: string; full_name: string | null };
    if (!confirm(`${profile.email} を削除しますか？`)) return;
    try {
      await removeMember(member.id);
      toast.success("メンバーを削除しました");
    } catch {
      toast.error("削除に失敗しました");
    }
  }

  const closingDayLabel = (day: number) => {
    if (day === 0) return "月末";
    return `${day}日`;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">設定</h1>

      <Card>
        <CardHeader>
          <CardTitle>締め日設定</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSettings} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="closing_day">締め日</Label>
              <Select name="closing_day" defaultValue={String(settings?.closing_day ?? 0)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">月末</SelectItem>
                  {[5, 10, 15, 20, 25].map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}日</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                現在: {closingDayLabel(settings?.closing_day ?? 0)}締め
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">タイムゾーン</Label>
              <Input
                name="timezone"
                defaultValue={settings?.timezone ?? "Asia/Tokyo"}
                readOnly
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : "保存"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>会社情報</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveCompanyInfo} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="company_address">所在地（住所）</Label>
              <Input
                id="company_address"
                name="company_address"
                defaultValue={settings?.company_address ?? ""}
                placeholder="例: 千葉県千葉市○○区○○ 1-2-3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_phone">電話番号</Label>
              <Input
                id="company_phone"
                name="company_phone"
                defaultValue={settings?.company_phone ?? ""}
                placeholder="例: 043-000-0000"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              帳票などに使用されます
            </p>
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : "保存"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>メンバー管理</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>メール</TableHead>
                <TableHead>名前</TableHead>
                <TableHead>ロール</TableHead>
                <TableHead className="w-[60px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const profile = m.profiles as unknown as { email: string; full_name: string | null };
                return (
                  <TableRow key={m.id}>
                    <TableCell>{profile.email}</TableCell>
                    <TableCell>{profile.full_name || "-"}</TableCell>
                    <TableCell>
                      <Select
                        defaultValue={m.role}
                        onValueChange={(val) => handleRoleChange(m.id, val)}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">オーナー</SelectItem>
                          <SelectItem value="admin">管理者</SelectItem>
                          <SelectItem value="manager">マネージャー</SelectItem>
                          <SelectItem value="employee">従業員</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {m.role !== "owner" && (
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(m)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

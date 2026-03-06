"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default function CreateOrgPage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("ログインしてください");
      setLoading(false);
      return;
    }

    // テナント作成
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name, slug: slug.toLowerCase() })
      .select()
      .single();

    if (orgError) {
      setError(orgError.message.includes("duplicate") ? "このスラッグは既に使用されています" : orgError.message);
      setLoading(false);
      return;
    }

    // オーナーとして追加
    await supabase
      .from("organization_members")
      .insert({ organization_id: org.id, user_id: user.id, role: "owner" });

    // テナント設定作成
    await supabase
      .from("tenant_settings")
      .insert({ tenant_id: org.id });

    // デフォルト業務タイプ作成
    await supabase.rpc("seed_default_work_types", { p_tenant_id: org.id });

    // テナントへリダイレクト
    const host = window.location.host;
    const protocol = window.location.protocol;
    if (host.includes("localhost")) {
      window.location.href = `${protocol}//${slug}.localhost:3000/dashboard`;
    } else {
      const parts = host.split(".");
      const baseDomain = parts.slice(-2).join(".");
      window.location.href = `${protocol}//${slug}.${baseDomain}/dashboard`;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">テナント作成</CardTitle>
          <CardDescription>新しいテナントを作成します</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">テナント名</Label>
              <Input
                id="name"
                placeholder="株式会社サンプル"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">スラッグ（サブドメイン）</Label>
              <Input
                id="slug"
                placeholder="sample"
                value={slug}
                onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                required
              />
              <p className="text-xs text-muted-foreground">
                {slug || "sample"}.localhost:3000 でアクセスできます
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "作成中..." : "テナントを作成"}
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link href="/select-org">戻る</Link>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

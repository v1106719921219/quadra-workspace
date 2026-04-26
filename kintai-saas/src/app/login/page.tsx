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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setSuccess("アカウントを作成しました。ログインしてください。");
      setIsSignUp(false);
      setLoading(false);
      return;
    }

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // 所属組織を取得してクッキーに設定
    const { data: orgs } = await supabase
      .from("organization_members")
      .select("organization:organizations(slug)")
      .eq("user_id", authData.user.id);

    if (orgs && orgs.length === 1) {
      const org = orgs[0].organization as unknown as { slug: string };
      document.cookie = `tenant_slug=${org.slug}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      window.location.href = "/dashboard";
      return;
    }

    // 複数組織 or 0件の場合はテナント選択へ
    window.location.href = "/select-org";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">勤怠管理システム</CardTitle>
          <CardDescription>
            {isSignUp ? "新規アカウントを作成" : "ログインしてください"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            {success && (
              <p className="text-sm text-green-600">{success}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? isSignUp
                  ? "登録中..."
                  : "ログイン中..."
                : isSignUp
                  ? "アカウント作成"
                  : "ログイン"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? (
              <>
                アカウントをお持ちですか？{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-primary underline hover:no-underline"
                >
                  ログイン
                </button>
              </>
            ) : (
              <>
                アカウントをお持ちでないですか？{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-primary underline hover:no-underline"
                >
                  新規登録
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

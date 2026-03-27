"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

interface Org {
  organization_id: string;
  role: string;
  organization: { id: string; slug: string; name: string };
}

export default function SelectOrgPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function loadOrgs() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data } = await supabase
        .from("organization_members")
        .select("organization_id, role, organization:organizations(id, slug, name)")
        .eq("user_id", user.id);

      setOrgs((data as unknown as Org[]) || []);
      setLoading(false);
    }
    loadOrgs();
  }, [supabase, router]);

  function goToOrg(slug: string) {
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

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">テナント選択</CardTitle>
          <CardDescription>利用するテナントを選択してください</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {orgs.length === 0 ? (
            <p className="text-center text-muted-foreground">
              所属するテナントがありません
            </p>
          ) : (
            <div className="space-y-2">
              {orgs.map((org) => (
                <Button
                  key={org.organization_id}
                  variant="outline"
                  className="w-full justify-between h-auto py-3"
                  onClick={() => goToOrg(org.organization.slug)}
                >
                  <span className="font-medium">{org.organization.name}</span>
                  <span className="text-xs text-muted-foreground">{org.role}</span>
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" asChild>
              <Link href="/create-org">新規テナント作成</Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

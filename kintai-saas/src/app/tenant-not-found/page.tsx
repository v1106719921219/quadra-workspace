import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function TenantNotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">テナントが見つかりません</h1>
      <p className="text-muted-foreground">URLを確認してください</p>
      <Button asChild>
        <Link href="/">トップへ戻る</Link>
      </Button>
    </div>
  );
}

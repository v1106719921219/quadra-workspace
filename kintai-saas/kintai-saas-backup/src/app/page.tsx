import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/50">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold">勤怠管理システム</h1>
        <p className="text-muted-foreground text-lg">
          マルチテナント対応のクラウド勤怠管理
        </p>
      </div>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/login">ログイン</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/create-org">テナント作成</Link>
        </Button>
      </div>
    </div>
  );
}

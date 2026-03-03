import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

/**
 * Service Roleクライアント（RLSバイパス）
 * APIキー認証済みリクエスト専用
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * APIキー認証
 * Authorization: Bearer <api_key> ヘッダーからキーを取得し、api_keysテーブルで検証
 * 成功時はuser_idとservice roleクライアントを返す。失敗時はエラーレスポンスを返す。
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<{ userId: string; supabase: ReturnType<typeof createServiceClient> } | NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authorization header required (Bearer <api_key>)" },
      { status: 401 }
    );
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key is empty" },
      { status: 401 }
    );
  }

  // SHA-256ハッシュ生成
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const supabase = createServiceClient();

  const { data: keyRecord, error } = await supabase
    .from("api_keys")
    .select("id, user_id, expires_at")
    .eq("key_hash", keyHash)
    .single();

  if (error || !keyRecord) {
    return NextResponse.json(
      { error: "Invalid API key" },
      { status: 401 }
    );
  }

  // 有効期限チェック
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "API key expired" },
      { status: 401 }
    );
  }

  // last_used_at更新（エラーは無視）
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id);

  return { userId: keyRecord.user_id, supabase };
}

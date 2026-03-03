"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

function generateRandomKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const hex = Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `gh_${hex}`;
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getApiKeys() {
  const user = await getUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, expires_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createApiKey(name: string) {
  const user = await getUser();
  const supabase = await createClient();

  if (!name.trim()) throw new Error("キー名を入力してください");

  const rawKey = generateRandomKey();
  const keyHash = await hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 10) + "...";

  const { error } = await supabase.from("api_keys").insert({
    user_id: user.id,
    name: name.trim(),
    key_hash: keyHash,
    key_prefix: keyPrefix,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/settings");

  // 生のキーは作成時のみ返す（以降はハッシュのみDB保存）
  return { rawKey };
}

export async function deleteApiKey(id: string) {
  await getUser();
  const supabase = await createClient();

  const { error } = await supabase.from("api_keys").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

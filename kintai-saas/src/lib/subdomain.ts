/**
 * ホスト名からサブドメインを抽出
 * kintai-saas用（ドメイン: *.kintai-saas.jp を想定）
 */
export function extractSubdomain(host: string): string | null {
  const hostname = host.split(":")[0];

  // localhost: demo.localhost → demo
  if (hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    if (parts.length >= 2 && parts[0] !== "localhost") {
      return parts[0];
    }
    return null;
  }

  // Vercelプレビューはサブドメインなし扱い
  if (hostname.endsWith(".vercel.app")) {
    return null;
  }

  const parts = hostname.split(".");

  // 3パーツ以上: demo.kintai-saas.jp → demo
  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (subdomain === "www") return null;
    return subdomain;
  }

  return null;
}

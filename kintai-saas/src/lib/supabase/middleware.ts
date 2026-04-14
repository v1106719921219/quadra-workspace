import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { extractSubdomain } from "@/lib/subdomain";

const tenantCache = new Map<string, { exists: boolean; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function updateSession(request: NextRequest) {
  try {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const userResult = await withTimeout(supabase.auth.getUser(), 3000);
    const user = userResult?.data?.user ?? null;

    const host = request.headers.get("host") || "";
    const subdomain = extractSubdomain(host);
    const pathname = request.nextUrl.pathname;

    const isApiRoute = pathname.startsWith("/api/");

    // 打刻画面 (/clock) はテナント内だが認証不要（タブレット共有用）
    const publicRoutes = ["/login", "/signup", "/auth", "/clock", "/tenant-not-found"];
    const isPublicRoute = publicRoutes.some((route) =>
      pathname.startsWith(route)
    );

    const isLandingPage = pathname === "/" && !subdomain;

    // サブドメインあり → テナント存在チェック
    if (subdomain && !isApiRoute && !pathname.startsWith("/tenant-not-found")) {
      const cached = tenantCache.get(subdomain);
      const now = Date.now();

      if (cached && now - cached.ts < CACHE_TTL) {
        if (!cached.exists) {
          const url = request.nextUrl.clone();
          url.pathname = "/tenant-not-found";
          return NextResponse.redirect(url);
        }
      } else {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const result = await withTimeout(
          Promise.resolve(
            adminClient
              .from("organizations")
              .select("id")
              .eq("slug", subdomain)
              .single()
          ),
          3000
        );

        if (result) {
          tenantCache.set(subdomain, { exists: !!result.data, ts: now });
          if (!result.data) {
            const url = request.nextUrl.clone();
            url.pathname = "/tenant-not-found";
            return NextResponse.redirect(url);
          }
        }
      }
    }

    // 未認証ユーザーのリダイレクト
    if (!user && !isPublicRoute && !isApiRoute && !isLandingPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // サブドメインなし + 認証済み → 組織選択ページへ
    const isOrgSelectionRoute = ["/select-org", "/create-org"].some((route) =>
      pathname.startsWith(route)
    );

    if (user && !subdomain && !isPublicRoute && !isApiRoute && !isOrgSelectionRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/select-org";
      return NextResponse.redirect(url);
    }

    // 認証済みユーザーがloginにアクセス → dashboard
    if (user && pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // サブドメインありの "/" → dashboard
    if (user && pathname === "/" && subdomain) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (error) {
    console.error("Middleware error:", error);
    return NextResponse.next({ request });
  }
}

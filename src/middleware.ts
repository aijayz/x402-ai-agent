import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Only rate-limit API routes and MCP — skip static/content pages
  if (!pathname.startsWith("/api/") && !pathname.startsWith("/mcp")) {
    return NextResponse.next();
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const walletAddress = request.headers.get("x-wallet-address") || null;

  const { allowed, retryAfter } = await checkRateLimit(pathname, ip, walletAddress);

  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter ?? 30) },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|icon.svg).*)",
  ],
};
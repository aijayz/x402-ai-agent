import { NextRequest, NextResponse } from "next/server";

// Payment middleware disabled for AI agent testing
// The MCP server handles its own payment for paid tools via createPaidMcpHandler
// and the client uses withPayment to handle 402 responses

export default async function middleware(request: NextRequest) {
  // Pass through all requests
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
  runtime: "nodejs",
};
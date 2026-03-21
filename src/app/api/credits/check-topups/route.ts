import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("Cron: check-topups ran (RPC polling not yet implemented — follow-up task)");
  return NextResponse.json({ ok: true, stub: true });
}

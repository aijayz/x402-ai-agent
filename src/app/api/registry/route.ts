import { NextResponse } from "next/server";
import { z } from "zod";
import { getRegistry } from "@/lib/registry/store";

const RegisterSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  mcpPath: z.string().default("/mcp"),
  description: z.string().min(1),
  categories: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const service = getRegistry().register(parsed.data);
  return NextResponse.json(service, { status: 201 });
}

export async function GET() {
  return NextResponse.json({ services: getRegistry().listAll() });
}

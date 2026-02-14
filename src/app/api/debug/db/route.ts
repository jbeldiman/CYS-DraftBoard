import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  
  const masked = url
    .replace(/\/\/([^:]+):([^@]+)@/, "//***:***@")
    .replace(/(\?.*)$/, ""); 

  return NextResponse.json({
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlMasked: masked || null,
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}

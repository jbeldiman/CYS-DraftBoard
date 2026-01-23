import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ error: "Draft boards are disabled" }, { status: 404 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Draft boards are disabled" }, { status: 404 });
}

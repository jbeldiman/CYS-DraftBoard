import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdminOrBoard(session: any) {
  const role = (session?.user as any)?.role;
  return role === "ADMIN" || role === "BOARD";
}

function extractId(req: Request, context: any): string {
  const fromParams = String(context?.params?.id ?? "").trim();
  if (fromParams) return fromParams;

  const u = new URL(req.url);
  const parts = u.pathname.split("/").filter(Boolean);
  const denyIdx = parts.lastIndexOf("deny");
  if (denyIdx > 0) {
    const candidate = String(parts[denyIdx - 1] ?? "").trim();
    if (candidate && candidate !== "access-requests") return candidate;
  }

  const fromQuery = String(u.searchParams.get("id") ?? "").trim();
  if (fromQuery) return fromQuery;

  return "";
}

export async function POST(req: Request, context: any) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminOrBoard(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const requestId = extractId(req, context);
    if (!requestId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const decisionNotes = typeof body?.decisionNotes === "string" ? body.decisionNotes.trim() : "";

    const meId = (session.user as any)?.id ? String((session.user as any).id) : "";
    if (!meId) return NextResponse.json({ error: "Missing session user id" }, { status: 401 });

    const ar = await prisma.accessRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    });

    if (!ar) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (ar.status !== "PENDING") return NextResponse.json({ error: "Request is not pending" }, { status: 400 });

    await prisma.accessRequest.update({
      where: { id: ar.id },
      data: {
        status: "DENIED",
        decidedAt: new Date(),
        decidedById: meId,
        decisionNotes: decisionNotes || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to deny request" }, { status: 500 });
  }
}

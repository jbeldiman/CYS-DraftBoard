import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdminOrBoard(session: any) {
  const role = (session?.user as any)?.role;
  return role === "ADMIN" || role === "BOARD";
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminOrBoard(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get("status") ?? "PENDING").toUpperCase();
    const type = (searchParams.get("type") ?? "").toUpperCase();

    const where: any = { status };
    if (type === "COACH" || type === "BOARD") where.type = type;

    const items = await prisma.accessRequest.findMany({
      where,
      orderBy: [{ requestedAt: "asc" }],
      select: {
        id: true,
        type: true,
        status: true,
        requestedAt: true,
        decidedAt: true,
        decisionNotes: true,
        user: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
        decidedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load access requests" }, { status: 500 });
  }
}

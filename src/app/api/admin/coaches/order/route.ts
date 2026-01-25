import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as { coachIds?: unknown };
    const coachIds: string[] = Array.isArray(body?.coachIds) ? (body.coachIds as unknown[]).map((v) => String(v)) : [];

    if (coachIds.length === 0) {
      return NextResponse.json({ error: "coachIds[] is required" }, { status: 400 });
    }

    const found = await prisma.user.findMany({
      where: { id: { in: coachIds }, role: "COACH" },
      select: { id: true },
    });

    if (found.length !== coachIds.length) {
      return NextResponse.json({ error: "One or more coachIds are invalid" }, { status: 400 });
    }

    await prisma.$transaction(
      coachIds.map((id: string, idx: number) =>
        prisma.user.update({
          where: { id },
          data: { coachOrder: idx + 1 },
        })
      )
    );

    return NextResponse.json({ ok: true, updated: coachIds.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to save coach order" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

export async function DELETE(_req: Request, context: any) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const id = String(context?.params?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const coach = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, coachDivision: true, isDraftCoach: true },
    });
    if (!coach || !coach.isDraftCoach) return NextResponse.json({ error: "Coach not found" }, { status: 404 });

    await prisma.user.update({
      where: { id },
      data: {
        isDraftCoach: false,
        coachDivision: null,
        coachOrder: 0,
        role: coach.role === "COACH" ? "PARENT" : coach.role,
      },
    });

    if (coach.coachDivision) {
      const remaining = await prisma.user.findMany({
        where: { isDraftCoach: true, coachDivision: coach.coachDivision },
        orderBy: [{ coachOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      await prisma.$transaction(
        remaining.map((user, index) =>
          prisma.user.update({ where: { id: user.id }, data: { coachOrder: index + 1 } })
        )
      );
    }

    return NextResponse.json({ ok: true, preservedHistory: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to remove coach" }, { status: 500 });
  }
}

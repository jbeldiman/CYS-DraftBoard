import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

type Role = "ADMIN" | "BOARD" | "COACH" | "PARENT";

function getRole(session: any): Role | null {
  const r = (session?.user as any)?.role;
  return typeof r === "string" ? (r as Role) : null;
}

function isAdminOrBoard(session: any) {
  const r = getRole(session);
  return r === "ADMIN" || r === "BOARD";
}

async function currentEvent() {
  const e =
    (await prisma.draftEvent.findFirst({
      where: { phase: "LIVE" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })) ??
    (await prisma.draftEvent.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    }));

  if (!e?.id) throw new Error("No draft event found");
  return e.id;
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminOrBoard(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const draftEventId = await currentEvent();

 
    const maxRow = await prisma.draftPlayer.aggregate({
      where: { draftEventId, evalNumber: { not: null } },
      _max: { evalNumber: true },
    });
    let next = (maxRow._max.evalNumber ?? 0) + 1;

    const needsNumbers = await prisma.draftPlayer.findMany({
      where: { draftEventId, evalNumber: null },
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
        { dob: "asc" },
        { id: "asc" },
      ],
      select: { id: true },
    });

    if (!needsNumbers.length) {
      return NextResponse.json({ ok: true, assigned: 0 });
    }

    await prisma.$transaction(
      needsNumbers.map((p) =>
        prisma.draftPlayer.update({
          where: { id: p.id },
          data: { evalNumber: next++ },
        })
      )
    );

    return NextResponse.json({ ok: true, assigned: needsNumbers.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ? String(err.message) : "Failed to seed numbers" },
      { status: 500 }
    );
  }
}

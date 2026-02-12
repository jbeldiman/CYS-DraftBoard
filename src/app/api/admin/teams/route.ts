import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isStaff(session: any) {
  const role = (session?.user as any)?.role as string | undefined;
  return role === "ADMIN" || role === "BOARD";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isStaff(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const event =
    (await prisma.draftEvent.findFirst({
      where: { phase: "LIVE" },
      orderBy: { updatedAt: "desc" },
    })) ??
    (await prisma.draftEvent.findFirst({
      orderBy: { updatedAt: "desc" },
    }));

  if (!event) return NextResponse.json({ teams: [] });

  const teams = await prisma.draftTeam.findMany({
    where: { draftEventId: event.id },
    orderBy: [{ order: "asc" }],
    select: { id: true, name: true, order: true },
  });

  return NextResponse.json({ teams });
}
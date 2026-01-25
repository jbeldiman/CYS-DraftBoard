import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

async function latestEventId() {
  const e = await prisma.draftEvent.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!e?.id) throw new Error("No draft event found");
  return e.id;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const draftEventId = await latestEventId();
  const body = await req.json().catch(() => null);

  const playerId = String(body?.playerId ?? "");
  const draftCost = body?.draftCost === null || body?.draftCost === undefined ? "" : String(body.draftCost).trim();

  if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

  const player = await prisma.draftPlayer.findFirst({
    where: { id: playerId, draftEventId, wantsU13: true, isDraftEligible: true },
    select: { id: true, leagueChoice: true },
  });

  if (!player) return NextResponse.json({ error: "Player not found or not eligible" }, { status: 404 });

  const groupKey = (player.leagueChoice ?? "").trim() ? `league:${(player.leagueChoice ?? "").trim()}` : "league:unknown";

  await prisma.siblingDraftCost.upsert({
    where: { draftEventId_playerId: { draftEventId, playerId } },
    create: { draftEventId, playerId, groupKey, draftCost: draftCost || null },
    update: { groupKey, draftCost: draftCost || null },
  });

  return NextResponse.json({ ok: true });
}

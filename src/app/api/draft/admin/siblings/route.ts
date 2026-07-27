import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveDraftEventId } from "@/lib/activeDraftEvent";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

async function latestEventId() {
  return requireActiveDraftEventId();
}

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function registrantKey(player: {
  primaryEmail: string | null;
  primaryPhone: string | null;
  guardian1Name: string | null;
  guardian2Name: string | null;
}) {
  const email = norm(player.primaryEmail);
  if (email) return `email:${email}`;
  const phone = norm(player.primaryPhone).replace(/[^\d]/g, "");
  if (phone) return `phone:${phone}`;
  const guardian = norm(player.guardian1Name || player.guardian2Name);
  return guardian ? `name:${guardian}` : "";
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

  const players = await prisma.draftPlayer.findMany({
    where: { draftEventId, isDraftEligible: true },
    select: {
      id: true,
      leagueChoice: true,
      primaryEmail: true,
      primaryPhone: true,
      guardian1Name: true,
      guardian2Name: true,
    },
  });
  const player = players.find((candidate) => candidate.id === playerId);
  if (!player) return NextResponse.json({ error: "Player not found or not eligible" }, { status: 404 });

  const configured = await prisma.siblingDraftCost.findUnique({
    where: { draftEventId_playerId: { draftEventId, playerId } },
    select: { groupKey: true },
  });

  let siblings = [] as typeof players;
  if (configured && !configured.groupKey.startsWith("legacy:")) {
    const configuredRows = await prisma.siblingDraftCost.findMany({
      where: { draftEventId, groupKey: configured.groupKey },
      select: { playerId: true },
    });
    const configuredIds = new Set(configuredRows.map((row) => row.playerId));
    siblings = players.filter((candidate) => configuredIds.has(candidate.id));
  }

  if (siblings.length < 2) {
    const key = registrantKey(player);
    const league = norm(player.leagueChoice);
    siblings = players.filter(
      (candidate) => key && league && registrantKey(candidate) === key && norm(candidate.leagueChoice) === league
    );
  }

  if (siblings.length < 2) {
    return NextResponse.json({ error: "No sibling group could be confirmed for this player." }, { status: 409 });
  }

  const groupKey = `siblings:${createHash("sha256")
    .update(siblings.map((sibling) => sibling.id).sort().join("|"))
    .digest("hex")
    .slice(0, 24)}`;

  await prisma.$transaction(
    siblings.map((sibling) =>
      prisma.siblingDraftCost.upsert({
        where: { draftEventId_playerId: { draftEventId, playerId: sibling.id } },
        create: {
          draftEventId,
          playerId: sibling.id,
          groupKey,
          draftCost: sibling.id === playerId ? draftCost || null : null,
        },
        update: {
          groupKey,
          ...(sibling.id === playerId ? { draftCost: draftCost || null } : {}),
        },
      })
    )
  );

  return NextResponse.json({ ok: true, groupKey, siblingCount: siblings.length });
}

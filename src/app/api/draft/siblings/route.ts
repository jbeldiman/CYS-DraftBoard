import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { coachesDivision } from "@/lib/coachAccess";
import { currentSiblingRating, siblingDraftRule } from "@/lib/siblingDraft";

export const runtime = "nodejs";

type Division = "U11" | "U13";

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function displayName(value: string | null | undefined) {
  return (value ?? "").trim();
}

function registrantName(player: { guardian1Name: string | null; guardian2Name: string | null }) {
  return displayName(player.guardian1Name) || displayName(player.guardian2Name) || "Family";
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
  const guardian = norm(registrantName(player));
  return guardian ? `name:${guardian}` : "";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = String((session.user as any).role ?? "");
  const isAdminOrBoard = role === "ADMIN" || role === "BOARD";
  const allowedDivisions: Division[] = isAdminOrBoard
    ? ["U11", "U13"]
    : (["U11", "U13"] as Division[]).filter((division) => coachesDivision(session.user as any, division));

  if (!allowedDivisions.length) {
    return NextResponse.json({ error: "Sibling information is available to approved coaches and CYS leadership." }, { status: 403 });
  }

  const candidateEvents = await prisma.draftEvent.findMany({
    where: {
      seasonYear: 2026,
      season: "FALL",
      division: { in: allowedDivisions },
      phase: { not: "ARCHIVED" },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, division: true, phase: true, isActive: true },
  });

  const eventByDivision = new Map<Division, (typeof candidateEvents)[number]>();
  for (const event of candidateEvents) {
    const division = event.division as Division | null;
    if (division && !eventByDivision.has(division)) eventByDivision.set(division, event);
  }

  const events = [];
  for (const division of allowedDivisions) {
    const event = eventByDivision.get(division);
    if (!event) continue;

    const [players, configuredCosts] = await Promise.all([
      prisma.draftPlayer.findMany({
        where: { draftEventId: event.id, isDraftEligible: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          fullName: true,
          guardian1Name: true,
          guardian2Name: true,
          primaryEmail: true,
          primaryPhone: true,
          rating: true,
          spring2026Rating: true,
          fall2025Rating: true,
          spring2025Rating: true,
          isGoalie: true,
          isDrafted: true,
        },
      }),
      prisma.siblingDraftCost.findMany({
        where: { draftEventId: event.id },
        select: { playerId: true, groupKey: true },
      }),
    ]);

    const costByPlayerId = new Map<string, { playerId: string; groupKey: string }>(
      configuredCosts.map((row) => [row.playerId, row])
    );
    const configuredGroupSizes = new Map<string, number>();
    for (const row of configuredCosts) {
      configuredGroupSizes.set(row.groupKey, (configuredGroupSizes.get(row.groupKey) ?? 0) + 1);
    }

    const buckets = new Map<string, typeof players>();
    for (const player of players) {
      const configured = costByPlayerId.get(player.id);
      const configuredKey =
        configured &&
        !configured.groupKey.startsWith("legacy:") &&
        (configuredGroupSizes.get(configured.groupKey) ?? 0) > 1
          ? `configured:${configured.groupKey}`
          : "";
      const fallbackKey = registrantKey(player);
      const key = configuredKey || (fallbackKey ? `family:${fallbackKey}` : "");
      if (!key) continue;
      const bucket = buckets.get(key) ?? [];
      bucket.push(player);
      buckets.set(key, bucket);
    }

    const groups = [...buckets.entries()]
      .filter(([, siblings]) => siblings.length > 1)
      .map(([groupKey, siblings]) => ({
        groupKey,
        registrantName: registrantName(siblings[0]),
        players: siblings.map((player) => {
          const rating = currentSiblingRating(player);
          const rule = siblingDraftRule(rating);
          return {
            playerId: player.id,
            playerName: player.fullName,
            rating,
            isGoalie: player.isGoalie,
            isDrafted: player.isDrafted,
            costLabel: rule?.label ?? "Needs rating",
            costDetail: rule?.detail ?? "A star rating is required before this sibling can be reserved automatically.",
            targetRound: rule?.targetRound ?? null,
          };
        }),
      }))
      .sort((a, b) => a.registrantName.localeCompare(b.registrantName));

    events.push({
      draftEventId: event.id,
      eventName: event.name,
      division,
      phase: event.phase,
      isActive: event.isActive,
      groups,
      siblingPlayers: groups.reduce((total, group) => total + group.players.length, 0),
    });
  }

  return NextResponse.json({ events });
}

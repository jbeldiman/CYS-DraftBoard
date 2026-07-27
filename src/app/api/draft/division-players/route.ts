import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { coachesDivision } from "@/lib/coachAccess";

export const runtime = "nodejs";

type Division = "U11" | "U13";

function clampRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.max(1, Math.min(5, Math.trunc(numberValue)));
}

function divisionFrom(value: string | null): Division | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "U11" || normalized === "U13" ? normalized : null;
}

function ratingFor(entry: {
  rating: number | null;
  spring2025Rating: number | null;
  fall2025Rating: number | null;
  spring2026Rating: number | null;
}) {
  return clampRating(
    entry.rating ??
      entry.spring2026Rating ??
      entry.fall2025Rating ??
      entry.spring2025Rating
  );
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role ?? "");
  const isViewer = !!(session?.user as any)?.isViewer;

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const division = divisionFrom(url.searchParams.get("division"));
  if (!division) {
    return NextResponse.json({ error: "division must be U11 or U13" }, { status: 400 });
  }

  const hasAllDivisionAccess = role === "ADMIN" || role === "BOARD" || isViewer;
  if (!hasAllDivisionAccess && !coachesDivision(session.user as any, division)) {
    return NextResponse.json(
      { error: `Your account is not approved for the ${division} player pool.` },
      { status: 403 }
    );
  }

  const event = await prisma.draftEvent.findFirst({
    where: {
      seasonYear: 2026,
      season: "FALL",
      division,
      phase: { not: "ARCHIVED" },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      phase: true,
      division: true,
      season: true,
      seasonYear: true,
      isActive: true,
    },
  });

  if (!event) {
    return NextResponse.json(
      { error: `Fall 2026 ${division} draft event was not found.` },
      { status: 404 }
    );
  }

  const rows = await prisma.draftPlayer.findMany({
    where: { draftEventId: event.id, isDraftEligible: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      permanentPlayerId: true,
      firstName: true,
      lastName: true,
      fullName: true,
      dob: true,
      birthYear: true,
      gender: true,
      experience: true,
      notes: true,
      rating: true,
      spring2025Rating: true,
      fall2025Rating: true,
      spring2026Rating: true,
      isGoalie: true,
      isDraftEligible: true,
      isDrafted: true,
      draftedAt: true,
      evalNumber: true,
      draftedTeam: { select: { id: true, name: true, order: true } },
      permanentPlayer: {
        select: {
          draftEntries: {
            where: { draftEventId: { not: event.id } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              rating: true,
              spring2025Rating: true,
              fall2025Rating: true,
              spring2026Rating: true,
              experience: true,
              isGoalie: true,
              draftedTeam: { select: { name: true } },
              draftEvent: {
                select: {
                  name: true,
                  seasonYear: true,
                  season: true,
                  division: true,
                  phase: true,
                  scheduledAt: true,
                },
              },
              picks: {
                take: 1,
                orderBy: { overallNumber: "asc" },
                select: {
                  overallNumber: true,
                  round: true,
                  pickInRound: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const siblingRows = await prisma.siblingDraftCost.findMany({
    where: { draftEventId: event.id },
    select: {
      playerId: true,
      groupKey: true,
      player: { select: { fullName: true } },
    },
  });

  const groupMembers = new Map<string, Array<{ playerId: string; fullName: string }>>();
  for (const sibling of siblingRows) {
    const members = groupMembers.get(sibling.groupKey) ?? [];
    members.push({ playerId: sibling.playerId, fullName: sibling.player.fullName });
    groupMembers.set(sibling.groupKey, members);
  }

  const siblingsByPlayer = new Map<string, string[]>();
  for (const members of groupMembers.values()) {
    for (const member of members) {
      siblingsByPlayer.set(
        member.playerId,
        members
          .filter((candidate) => candidate.playerId !== member.playerId)
          .map((candidate) => candidate.fullName)
          .sort((a, b) => a.localeCompare(b))
      );
    }
  }

  const players = rows.map((player) => ({
    id: player.id,
    permanentPlayerId: player.permanentPlayerId,
    firstName: player.firstName,
    lastName: player.lastName,
    fullName: player.fullName,
    dob: player.dob,
    birthYear: player.birthYear,
    gender: player.gender,
    experience: player.experience,
    parentComment: player.notes,
    rating: ratingFor(player),
    isGoalie: player.isGoalie,
    isDraftEligible: player.isDraftEligible,
    isDrafted: player.isDrafted,
    draftedAt: player.draftedAt,
    evalNumber: player.evalNumber,
    draftedTeam: player.draftedTeam,
    siblings: siblingsByPlayer.get(player.id) ?? [],
    history:
      player.permanentPlayer?.draftEntries.map((entry) => {
        const pick = entry.picks[0] ?? null;
        return {
          id: entry.id,
          eventName: entry.draftEvent.name,
          seasonYear: entry.draftEvent.seasonYear,
          season: entry.draftEvent.season,
          division: entry.draftEvent.division,
          phase: entry.draftEvent.phase,
          scheduledAt: entry.draftEvent.scheduledAt,
          rating: ratingFor(entry),
          experience: entry.experience,
          isGoalie: entry.isGoalie,
          teamName: entry.draftedTeam?.name ?? null,
          overallPick: pick?.overallNumber ?? null,
          round: pick?.round ?? null,
          pickInRound: pick?.pickInRound ?? null,
        };
      }) ?? [],
  }));

  const ratedPlayers = players.filter((player) => player.rating !== null).length;
  const goalieCount = players.filter((player) => player.isGoalie).length;
  const draftedCount = players.filter((player) => player.isDrafted).length;

  return NextResponse.json({
    event,
    summary: {
      total: players.length,
      available: players.length - draftedCount,
      drafted: draftedCount,
      goalies: goalieCount,
      rated: ratedPlayers,
    },
    players,
  });
}

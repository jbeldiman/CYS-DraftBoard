import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdminOrBoard(session: any) {
  const role = (session?.user as any)?.role as string | undefined;
  return !!session?.user && (role === "ADMIN" || role === "BOARD");
}

function snakeTeamIndexFromOverallPick(overallPick1: number, teamCount: number) {
  if (teamCount <= 0) return { round: 1, index: 0, posInRound: 0 };
  const p0 = overallPick1 - 1;
  const round = Math.floor(p0 / teamCount) + 1;
  const posInRound = p0 % teamCount;
  const isReverse = round % 2 === 0;
  const index = isReverse ? teamCount - 1 - posInRound : posInRound;
  return { round, index, posInRound };
}

function snakePickInRoundFromOverall(overallPick1: number, teamCount: number) {
  if (teamCount <= 0) return 1;
  const p0 = overallPick1 - 1;
  return (p0 % teamCount) + 1;
}

function snakeOverallFromRoundTeamIndex(round: number, teamIndex: number, teamCount: number) {
  const reverse = round % 2 === 0;
  const posInRound = reverse ? teamCount - 1 - teamIndex : teamIndex;
  const overallNumber = (round - 1) * teamCount + posInRound + 1;
  const pickInRound = posInRound + 1;
  return { overallNumber, pickInRound };
}

function parseDraftCost(v: unknown): number | null {
  const n = typeof v === "string" ? parseInt(v.trim(), 10) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 1 || i > 10) return null;
  return i;
}

async function findNextOpenOverall(tx: any, draftEventId: string, startOverall: number) {
  let candidate = startOverall;
  for (let i = 0; i < 10000; i++) {
    const exists = await tx.draftPick.findFirst({
      where: { draftEventId, overallNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    candidate += 1;
  }
  throw new Error("Unable to advance to next pick (too many filled picks).");
}

async function findNthUpcomingOpenPickOverallForTeam(args: {
  tx: any;
  draftEventId: string;
  fromOverallExclusive: number;
  teams: Array<{ id: string }>;
  teamIndex: number;
  n: number;
}) {
  const { tx, draftEventId, fromOverallExclusive, teams, teamIndex, n } = args;

  const teamCount = teams.length;
  if (teamCount <= 0) throw new Error("No teams found for this draft event.");

  const maxScan = fromOverallExclusive + teamCount * 60;

  let found = 0;

  for (let overall = fromOverallExclusive + 1; overall <= maxScan; overall++) {
    const { index } = snakeTeamIndexFromOverallPick(overall, teamCount);
    if (index !== teamIndex) continue;

    const occupied = await tx.draftPick.findFirst({
      where: { draftEventId, overallNumber: overall },
      select: { id: true },
    });
    if (occupied) continue;

    found += 1;
    if (found === n) return overall;
  }

  throw new Error("Unable to find an open future pick slot for sibling placement.");
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdminOrBoard(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));

  const playerId = String(body?.playerId ?? "");
  const overallNumberRaw = body?.overallNumber ?? body?.pickNumber ?? null;

  const teamIdRaw = body?.teamId != null ? String(body.teamId) : "";
  const roundRaw = body?.round != null ? Number(body.round) : NaN;

  const overallNumber =
    typeof overallNumberRaw === "number"
      ? overallNumberRaw
      : typeof overallNumberRaw === "string"
      ? Number(overallNumberRaw)
      : NaN;

  if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });

  const usingOverall = Number.isFinite(overallNumber) && overallNumber >= 1;
  const usingRoundTeam = !!teamIdRaw && Number.isFinite(roundRaw) && roundRaw >= 1;

  if (!usingOverall && !usingRoundTeam) {
    return NextResponse.json(
      { error: "Invalid payload. Send { overallNumber, playerId } (or { pickNumber, playerId }) OR { teamId, round, playerId }." },
      { status: 400 }
    );
  }

  try {
    const event =
      (await prisma.draftEvent.findFirst({
        where: { phase: "LIVE" },
        orderBy: { updatedAt: "desc" },
      })) ??
      (await prisma.draftEvent.findFirst({
        orderBy: { updatedAt: "desc" },
      }));

    if (!event) return NextResponse.json({ error: "No event found" }, { status: 400 });
    if (event.phase !== "LIVE") return NextResponse.json({ error: "Draft is not live" }, { status: 400 });

    const teams = await prisma.draftTeam.findMany({
      where: { draftEventId: event.id },
      orderBy: { order: "asc" },
      select: { id: true },
    });

    if (!teams.length) return NextResponse.json({ error: "No teams found" }, { status: 400 });

    const teamCount = teams.length;

    let resolvedOverall = overallNumber;
    let resolvedTeamId = teamIdRaw;
    let resolvedRound = roundRaw;
    let resolvedPickInRound = 1;
    let resolvedTeamIndex = -1;

    if (usingOverall) {
      const { round, index } = snakeTeamIndexFromOverallPick(resolvedOverall, teamCount);
      const team = teams[index] ?? null;
      if (!team) return NextResponse.json({ error: "Unable to resolve team for that pick" }, { status: 400 });

      resolvedTeamId = team.id;
      resolvedTeamIndex = index;
      resolvedRound = round;
      resolvedPickInRound = snakePickInRoundFromOverall(resolvedOverall, teamCount);
    } else {
      resolvedTeamIndex = teams.findIndex((t) => t.id === resolvedTeamId);
      if (resolvedTeamIndex < 0) return NextResponse.json({ error: "Team not found" }, { status: 404 });

      const slot = snakeOverallFromRoundTeamIndex(resolvedRound, resolvedTeamIndex, teamCount);
      resolvedOverall = slot.overallNumber;
      resolvedPickInRound = slot.pickInRound;
    }

    const player = await prisma.draftPlayer.findUnique({
      where: { id: playerId },
      select: { id: true, draftEventId: true, isDraftEligible: true, isDrafted: true },
    });

    if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });
    if (player.draftEventId !== event.id) {
      return NextResponse.json({ error: "Player is not in this draft event" }, { status: 400 });
    }
    if (!player.isDraftEligible) return NextResponse.json({ error: "Player is not draft-eligible" }, { status: 400 });
    if (player.isDrafted) return NextResponse.json({ error: "Player already drafted" }, { status: 409 });

    const created = await prisma.$transaction(async (tx) => {
      const slotExisting = await tx.draftPick.findFirst({
        where: {
          draftEventId: event.id,
          overallNumber: resolvedOverall,
        },
        select: { id: true },
      });
      if (slotExisting) throw new Error("That overall pick is already filled");

      const playerExisting = await tx.draftPick.findFirst({
        where: { draftEventId: event.id, playerId },
        select: { id: true },
      });
      if (playerExisting) throw new Error("That player has already been drafted");

      const now = new Date();

      const pick = await tx.draftPick.create({
        data: {
          draftEventId: event.id,
          teamId: resolvedTeamId,
          playerId,
          round: resolvedRound,
          pickInRound: resolvedPickInRound,
          overallNumber: resolvedOverall,
          madeAt: now,
        },
        select: { id: true, overallNumber: true },
      });

      await tx.draftPlayer.update({
        where: { id: playerId },
        data: {
          isDrafted: true,
          draftedTeamId: resolvedTeamId,
          draftedAt: now,
        },
      });

      let siblingAutoPick: { id: string; overallNumber: number } | null = null;

      const costRow = await tx.siblingDraftCost.findUnique({
        where: {
          draftEventId_playerId: {
            draftEventId: event.id,
            playerId,
          },
        },
        select: { groupKey: true, draftCost: true },
      });

      const costN = parseDraftCost(costRow?.draftCost ?? null);

      if (costRow?.groupKey && costN != null) {
        const siblingsInGroup = await tx.siblingDraftCost.findMany({
          where: {
            draftEventId: event.id,
            groupKey: costRow.groupKey,
            playerId: { not: playerId },
          },
          select: { playerId: true },
        });

        if (siblingsInGroup.length > 0) {
          const siblingCandidateIds = siblingsInGroup.map((s) => s.playerId);

          const siblingPlayer = await tx.draftPlayer.findFirst({
            where: {
              draftEventId: event.id,
              id: { in: siblingCandidateIds },
              isDraftEligible: true,
              isDrafted: false,
            },
            select: { id: true },
          });

          if (siblingPlayer) {
            const targetOverall = await findNthUpcomingOpenPickOverallForTeam({
              tx,
              draftEventId: event.id,
              fromOverallExclusive: resolvedOverall,
              teams,
              teamIndex: resolvedTeamIndex,
              n: costN,
            });

            const { round: sibRound } = snakeTeamIndexFromOverallPick(targetOverall, teamCount);
            const sibPickInRound = snakePickInRoundFromOverall(targetOverall, teamCount);

            const sibPick = await tx.draftPick.create({
              data: {
                draftEventId: event.id,
                teamId: resolvedTeamId,
                playerId: siblingPlayer.id,
                round: sibRound,
                pickInRound: sibPickInRound,
                overallNumber: targetOverall,
                madeAt: now,
              },
              select: { id: true, overallNumber: true },
            });

            await tx.draftPlayer.update({
              where: { id: siblingPlayer.id },
              data: {
                isDrafted: true,
                draftedTeamId: resolvedTeamId,
                draftedAt: now,
              },
            });

            siblingAutoPick = sibPick;
          }
        }
      }

      if ((event.currentPick ?? 1) === resolvedOverall) {
        const nextPick = await findNextOpenOverall(tx, event.id, resolvedOverall + 1);

        if (!event.isPaused) {
          const endsAt = new Date(now.getTime() + (event.pickClockSeconds ?? 120) * 1000);
          await tx.draftEvent.update({
            where: { id: event.id },
            data: { currentPick: nextPick, clockEndsAt: endsAt },
          });
        } else {
          await tx.draftEvent.update({
            where: { id: event.id },
            data: { currentPick: nextPick },
          });
        }
      }

      return { pick, siblingAutoPick };
    });

    return NextResponse.json({
      ok: true,
      id: created.pick.id,
      overallNumber: created.pick.overallNumber,
      siblingAutoPick: created.siblingAutoPick,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "Failed to create pick");

    if (msg.includes("already filled") || msg.includes("already been drafted")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    console.error("POST /api/draft/admin/pick error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function jsonErr(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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
  if (!session?.user) return jsonErr("Unauthorized", 401);

  const role = (session.user as any).role as string | undefined;
  const userId = (session.user as any).id as string | undefined;

  if (!userId) return jsonErr("Unauthorized", 401);
  if (role !== "COACH") return jsonErr("Forbidden", 403);

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const playerId = body?.playerId as string | undefined;
  if (!playerId) return jsonErr("Missing playerId", 400);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const event =
        (await tx.draftEvent.findFirst({
          where: { phase: "LIVE" },
          orderBy: { updatedAt: "desc" },
        })) ??
        (await tx.draftEvent.findFirst({
          orderBy: { updatedAt: "desc" },
        }));

      if (!event) throw new Error("No draft event found.");
      if (event.phase !== "LIVE") throw new Error("Draft is not live.");
      if (event.isPaused) throw new Error("Draft is paused.");

      const teams = await tx.draftTeam.findMany({
        where: { draftEventId: event.id },
        orderBy: [{ order: "asc" }],
        select: { id: true, name: true, order: true, coachUserId: true },
      });

      if (!teams.length) throw new Error("No teams found for this draft event.");

      const overall = event.currentPick ?? 1;
      const teamCount = teams.length;

      const { round, index: onClockIndex } = snakeTeamIndexFromOverallPick(overall, teamCount);
      const pickInRound = snakePickInRoundFromOverall(overall, teamCount);

      const onClockTeam = teams[onClockIndex];
      if (!onClockTeam) throw new Error("Unable to resolve on-clock team.");

      if (onClockTeam.coachUserId !== userId) {
        throw new Error("It is not your team's turn to pick.");
      }

      const player = await tx.draftPlayer.findFirst({
        where: {
          id: playerId,
          draftEventId: event.id,
        },
        select: {
          id: true,
          fullName: true,
          isDraftEligible: true,
          isDrafted: true,
        },
      });

      if (!player) throw new Error("Player not found for this draft event.");
      if (!player.isDraftEligible) throw new Error("That player is not draft eligible.");
      if (player.isDrafted) throw new Error("That player has already been drafted.");

      const existingPick = await tx.draftPick.findFirst({
        where: { draftEventId: event.id, playerId },
        select: { id: true },
      });
      if (existingPick) throw new Error("That player has already been drafted.");

      const existingSlot = await tx.draftPick.findFirst({
        where: {
          draftEventId: event.id,
          overallNumber: overall,
        },
        select: { id: true },
      });
      if (existingSlot) throw new Error("This pick slot is already filled.");

      const now = new Date();

      const pick = await tx.draftPick.create({
        data: {
          draftEventId: event.id,
          teamId: onClockTeam.id,
          playerId,
          overallNumber: overall,
          round,
          pickInRound,
          madeAt: now,
        },
        select: {
          id: true,
          overallNumber: true,
          round: true,
          pickInRound: true,
          madeAt: true,
          team: { select: { id: true, name: true, order: true } },
          player: { select: { id: true, fullName: true, rank: true } },
        },
      });

      await tx.draftPlayer.update({
        where: { id: playerId },
        data: {
          isDrafted: true,
          draftedTeamId: onClockTeam.id,
          draftedAt: now,
        },
      });

      // ---------- SIBLING AUTO-PICK (if configured) ----------

      let siblingAutoPick: any = null;

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
            select: {
              id: true,
              fullName: true,
              rank: true,
            },
          });

          if (siblingPlayer) {
            const targetOverall = await findNthUpcomingOpenPickOverallForTeam({
              tx,
              draftEventId: event.id,
              fromOverallExclusive: overall,
              teams,
              teamIndex: onClockIndex,
              n: costN,
            });

            const { round: sibRound } = snakeTeamIndexFromOverallPick(targetOverall, teamCount);
            const sibPickInRound = snakePickInRoundFromOverall(targetOverall, teamCount);

            siblingAutoPick = await tx.draftPick.create({
              data: {
                draftEventId: event.id,
                teamId: onClockTeam.id,
                playerId: siblingPlayer.id,
                overallNumber: targetOverall,
                round: sibRound,
                pickInRound: sibPickInRound,
                madeAt: now,
              },
              select: {
                id: true,
                overallNumber: true,
                round: true,
                pickInRound: true,
                madeAt: true,
                team: { select: { id: true, name: true, order: true } },
                player: { select: { id: true, fullName: true, rank: true } },
              },
            });

            await tx.draftPlayer.update({
              where: { id: siblingPlayer.id },
              data: {
                isDrafted: true,
                draftedTeamId: onClockTeam.id,
                draftedAt: now,
              },
            });
          }
        }
      }

      const nextOverallOpen = await findNextOpenOverall(tx, event.id, overall + 1);
      const endsAt = new Date(now.getTime() + (event.pickClockSeconds ?? 120) * 1000);

      await tx.draftEvent.update({
        where: { id: event.id },
        data: {
          currentPick: nextOverallOpen,
          clockEndsAt: endsAt,
        },
      });

      return { pick, siblingAutoPick };
    });

    return NextResponse.json(result);
  } catch (e: any) {
    const msg = e?.message ?? "Failed to draft player";
    const status =
      msg.includes("Unauthorized") || msg.includes("Forbidden")
        ? 403
        : msg.includes("not live") ||
            msg.includes("paused") ||
            msg.includes("turn") ||
            msg.includes("eligible") ||
            msg.includes("already") ||
            msg.includes("Missing") ||
            msg.includes("not found") ||
            msg.includes("No teams") ||
            msg.includes("Unable to find")
          ? 400
          : 500;

    console.error("POST /api/draft/pick error:", e);
    return NextResponse.json({ error: msg }, { status });
  }
}

export type SiblingRatingSource = {
  rating?: number | null;
  spring2026Rating?: number | null;
  fall2025Rating?: number | null;
  spring2025Rating?: number | null;
};

export type SiblingDraftRule = {
  rating: number;
  targetRound: number | null;
  label: string;
  detail: string;
};

export function currentSiblingRating(player: SiblingRatingSource): number | null {
  const raw =
    player.rating ??
    player.spring2026Rating ??
    player.fall2025Rating ??
    player.spring2025Rating ??
    null;
  if (raw === null || raw === undefined) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(1, Math.min(5, Math.trunc(numeric)));
}

export function siblingDraftRule(ratingValue: unknown): SiblingDraftRule | null {
  const numeric = Number(ratingValue);
  if (!Number.isFinite(numeric)) return null;
  const rating = Math.max(1, Math.min(5, Math.trunc(numeric)));

  if (rating === 5) {
    return {
      rating,
      targetRound: null,
      label: "Next team pick",
      detail: "Immediately reserved in the team's next available draft slot.",
    };
  }
  if (rating === 4) {
    return {
      rating,
      targetRound: 3,
      label: "Round 3",
      detail: "Round 3, or the team's next available pick if that slot has passed or is already reserved.",
    };
  }
  if (rating === 3) {
    return {
      rating,
      targetRound: 6,
      label: "Round 6",
      detail: "Round 6, or the team's next available pick after Round 5.",
    };
  }
  if (rating === 2) {
    return {
      rating,
      targetRound: 9,
      label: "Round 9",
      detail: "Round 9, or the team's next available pick after Round 8.",
    };
  }
  return {
    rating,
    targetRound: 12,
    label: "Round 12",
    detail: "Round 12, or the team's next available pick if that slot is no longer open.",
  };
}

function snakeTeamIndexFromOverallPick(overallPick1: number, teamCount: number) {
  const p0 = overallPick1 - 1;
  const round = Math.floor(p0 / teamCount) + 1;
  const posInRound = p0 % teamCount;
  const index = round % 2 === 0 ? teamCount - 1 - posInRound : posInRound;
  return { round, index };
}

function snakeOverallFromRoundTeamIndex(round: number, teamIndex: number, teamCount: number) {
  const posInRound = round % 2 === 0 ? teamCount - 1 - teamIndex : teamIndex;
  return (round - 1) * teamCount + posInRound + 1;
}

function snakePickInRoundFromOverall(overallPick1: number, teamCount: number) {
  return ((overallPick1 - 1) % teamCount) + 1;
}

async function findOpenTeamSlot(args: {
  tx: any;
  draftEventId: string;
  fromOverallExclusive: number;
  teamIndex: number;
  teamCount: number;
  targetRound: number | null;
}) {
  const { tx, draftEventId, fromOverallExclusive, teamIndex, teamCount, targetRound } = args;
  const targetOverall = targetRound
    ? snakeOverallFromRoundTeamIndex(targetRound, teamIndex, teamCount)
    : fromOverallExclusive + 1;
  const startOverall = Math.max(fromOverallExclusive + 1, targetOverall);
  const maxOverall = startOverall + teamCount * 80;

  for (let overall = startOverall; overall <= maxOverall; overall += 1) {
    const slot = snakeTeamIndexFromOverallPick(overall, teamCount);
    if (slot.index !== teamIndex) continue;
    const occupied = await tx.draftPick.findFirst({
      where: { draftEventId, overallNumber: overall },
      select: { id: true },
    });
    if (!occupied) return overall;
  }

  throw new Error("Unable to find an open future pick slot for sibling placement.");
}

export async function reserveUndraftedSiblings(args: {
  tx: any;
  draftEventId: string;
  triggerPlayerId: string;
  teamId: string;
  teamIndex: number;
  teams: Array<{ id: string }>;
  fromOverallExclusive: number;
  madeAt: Date;
}) {
  const {
    tx,
    draftEventId,
    triggerPlayerId,
    teamId,
    teamIndex,
    teams,
    fromOverallExclusive,
    madeAt,
  } = args;

  const triggerGroup = await tx.siblingDraftCost.findUnique({
    where: { draftEventId_playerId: { draftEventId, playerId: triggerPlayerId } },
    select: { groupKey: true },
  });
  if (!triggerGroup?.groupKey) return [];

  const groupRows = await tx.siblingDraftCost.findMany({
    where: {
      draftEventId,
      groupKey: triggerGroup.groupKey,
      playerId: { not: triggerPlayerId },
    },
    select: { playerId: true },
  });
  if (!groupRows.length) return [];

  const siblingIds = groupRows.map((row: { playerId: string }) => row.playerId);
  const siblings = await tx.draftPlayer.findMany({
    where: {
      draftEventId,
      id: { in: siblingIds },
      isDraftEligible: true,
      isDrafted: false,
    },
    select: {
      id: true,
      fullName: true,
      rank: true,
      rating: true,
      spring2026Rating: true,
      fall2025Rating: true,
      spring2025Rating: true,
    },
  });

  const planned = siblings
    .map((player: any) => {
      const rating = currentSiblingRating(player);
      return { player, rule: siblingDraftRule(rating) };
    })
    .filter((entry: any) => entry.rule)
    .sort((a: any, b: any) => {
      const aRound = a.rule.targetRound ?? 0;
      const bRound = b.rule.targetRound ?? 0;
      return aRound - bRound || a.player.fullName.localeCompare(b.player.fullName);
    });

  const created: any[] = [];
  for (const entry of planned) {
    const targetOverall = await findOpenTeamSlot({
      tx,
      draftEventId,
      fromOverallExclusive,
      teamIndex,
      teamCount: teams.length,
      targetRound: entry.rule.targetRound,
    });
    const { round } = snakeTeamIndexFromOverallPick(targetOverall, teams.length);
    const pickInRound = snakePickInRoundFromOverall(targetOverall, teams.length);

    const pick = await tx.draftPick.create({
      data: {
        draftEventId,
        teamId,
        playerId: entry.player.id,
        overallNumber: targetOverall,
        round,
        pickInRound,
        madeAt,
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
      where: { id: entry.player.id },
      data: { isDrafted: true, draftedTeamId: teamId, draftedAt: madeAt },
    });

    created.push({ ...pick, siblingRating: entry.rule.rating, siblingCost: entry.rule.label });
  }

  return created;
}

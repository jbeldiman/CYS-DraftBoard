import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function latestEventId() {
  const e = await prisma.draftEvent.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!e?.id) throw new Error("No draft event found");
  return e.id;
}

function normalizeKey(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}

export async function GET() {
  const draftEventId = await latestEventId();

  const players = await prisma.draftPlayer.findMany({
    where: {
      draftEventId,
      isDraftEligible: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      primaryEmail: true,
      primaryPhone: true,
    },
  });

  const groups: Record<string, typeof players> = {};

  for (const p of players) {
    const key =
      normalizeKey(p.primaryEmail) ||
      normalizeKey(p.primaryPhone);

    if (!key) continue;

    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const siblingGroups = Object.entries(groups)
    .filter(([, kids]) => kids.length > 1)
    .map(([groupKey, kids]) => ({
      groupKey,
      players: [...kids, ...kids],
    }));

  const costs = await prisma.siblingDraftCost.findMany({
    where: { draftEventId },
  });

  const costByKey = Object.fromEntries(
    costs.map((c) => [c.groupKey, c.draftCost])
  );

  return NextResponse.json({
    draftEventId,
    groups: siblingGroups.map((g) => ({
      groupKey: g.groupKey,
      draftCost: costByKey[g.groupKey] ?? null,
      players: g.players,
    })),
  });
}

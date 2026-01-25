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

function norm(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}

function makeGroupKey(p: { guardian1Name: string | null; primaryEmail: string | null }) {
  const enroller = norm(p.guardian1Name);
  if (enroller) return `enroller:${enroller}`;

  const email = norm(p.primaryEmail);
  if (email) return `email:${email}`;

  return "";
}

export async function GET() {
  const draftEventId = await latestEventId();

  const eligiblePlayers = await prisma.draftPlayer.findMany({
    where: { draftEventId, isDraftEligible: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      guardian1Name: true,
      primaryEmail: true,
    },
  });

  const buckets: Record<string, typeof eligiblePlayers> = {};

  for (const p of eligiblePlayers) {
    const key = makeGroupKey(p);
    if (!key) continue;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(p);
  }

  const groupsRaw = Object.entries(buckets)
    .filter(([, kids]) => kids.length > 1)
    .map(([groupKey, kids]) => ({
      groupKey,
      kids,
    }));

  const costs = await prisma.siblingDraftCost.findMany({
    where: { draftEventId },
  });

  const costByKey = Object.fromEntries(costs.map((c) => [c.groupKey, c.draftCost]));

  const groups = groupsRaw.map((g) => ({
    groupKey: g.groupKey,
    draftCost: costByKey[g.groupKey] ?? null,
    players: [...g.kids, ...g.kids].map((k) => ({
      id: k.id,
      firstName: k.firstName,
      lastName: k.lastName,
      fullName: k.fullName,
      primaryEmail: k.primaryEmail,
      primaryPhone: null,
    })),
  }));

  return NextResponse.json({
    draftEventId,
    debug: {
      eligibleCount: eligiblePlayers.length,
      uniqueGroupKeys: Object.keys(buckets).length,
      siblingGroupsFound: groups.length,
    },
    groups,
  });
}

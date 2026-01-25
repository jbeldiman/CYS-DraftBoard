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

function displayName(v: string | null | undefined) {
  return (v ?? "").trim();
}

function makeRegistrantName(p: { guardian1Name: string | null; guardian2Name: string | null }) {
  const g1 = displayName(p.guardian1Name);
  const g2 = displayName(p.guardian2Name);
  return g1 || g2 || "";
}

function makeRegistrantKey(p: { primaryEmail: string | null; primaryPhone: string | null; guardian1Name: string | null; guardian2Name: string | null }) {
  const email = norm(p.primaryEmail);
  if (email) return `email:${email}`;

  const phone = norm(p.primaryPhone).replace(/[^\d]/g, "");
  if (phone) return `phone:${phone}`;

  const g = norm(makeRegistrantName(p));
  if (g) return `name:${g}`;

  return "";
}

export async function GET() {
  const draftEventId = await latestEventId();


  const players = await prisma.draftPlayer.findMany({
    where: {
      draftEventId,
      wantsU13: true,
      isDraftEligible: true,
    },
    select: {
      id: true,
      fullName: true,
      leagueChoice: true,
      guardian1Name: true,
      guardian2Name: true,
      primaryEmail: true,
      primaryPhone: true,
    },
  });

  const buckets: Record<string, typeof players> = {};

  for (const p of players) {
    const registrantKey = makeRegistrantKey(p);
    const leagueKey = norm(p.leagueChoice);
    if (!registrantKey || !leagueKey) continue;

    const key = `${registrantKey}::league:${leagueKey}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(p);
  }

  const siblingGroups = Object.entries(buckets)
    .filter(([, kids]) => kids.length > 1)
    .map(([bucketKey, kids]) => {
      const registrantName = makeRegistrantName(kids[0]);
      const leagueChoice = kids[0].leagueChoice ?? "";

      return {
        bucketKey,
        registrantName,
        leagueChoice,
        kids,
      };
    });

  const costs = await prisma.siblingDraftCost.findMany({
    where: { draftEventId },
    select: { playerId: true, draftCost: true },
  });

  const costByPlayerId = Object.fromEntries(costs.map((c) => [c.playerId, c.draftCost ?? ""]));

  const rows = siblingGroups.flatMap((g) => {
    const allNames = g.kids.map((k) => k.fullName);

    return g.kids.map((kid) => {
      const siblings = allNames.filter((n) => n !== kid.fullName);
      return {
        registrantName: g.registrantName,
        leagueChoice: g.leagueChoice,
        playerId: kid.id,
        playerName: kid.fullName,
        siblingNames: siblings.join(", "),
        draftCost: costByPlayerId[kid.id] ?? "",
      };
    });
  });

  return NextResponse.json({
    draftEventId,
    rows,
  });
}

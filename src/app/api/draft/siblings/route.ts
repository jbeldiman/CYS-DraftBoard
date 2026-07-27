import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { requireActiveDraftEventId } from "@/lib/activeDraftEvent";

export const runtime = "nodejs";

type SiblingCostRow = {
  playerId: string;
  groupKey: string;
  draftCost: string | null;
};

async function latestEventId() {
  return requireActiveDraftEventId();
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

function makeRegistrantKey(p: {
  primaryEmail: string | null;
  primaryPhone: string | null;
  guardian1Name: string | null;
  guardian2Name: string | null;
}) {
  const email = norm(p.primaryEmail);
  if (email) return `email:${email}`;

  const phone = norm(p.primaryPhone).replace(/[^\d]/g, "");
  if (phone) return `phone:${phone}`;

  const guardian = norm(makeRegistrantName(p));
  if (guardian) return `name:${guardian}`;

  return "";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const draftEventId = await latestEventId();

  const [players, costs] = await Promise.all([
    prisma.draftPlayer.findMany({
      where: { draftEventId, isDraftEligible: true },
      select: {
        id: true,
        fullName: true,
        leagueChoice: true,
        guardian1Name: true,
        guardian2Name: true,
        primaryEmail: true,
        primaryPhone: true,
      },
    }),
    prisma.siblingDraftCost.findMany({
      where: { draftEventId },
      select: { playerId: true, groupKey: true, draftCost: true },
    }),
  ]);

  const typedCosts = costs as SiblingCostRow[];
  const costByPlayerId = new Map<string, SiblingCostRow>(
    typedCosts.map((cost) => [cost.playerId, cost])
  );
  const groupSizes = new Map<string, number>();
  for (const cost of typedCosts) {
    groupSizes.set(cost.groupKey, (groupSizes.get(cost.groupKey) ?? 0) + 1);
  }

  const buckets: Record<string, typeof players> = {};
  for (const player of players) {
    const configured = costByPlayerId.get(player.id);
    const hasRealConfiguredGroup =
      configured && !configured.groupKey.startsWith("legacy:") && (groupSizes.get(configured.groupKey) ?? 0) > 1;

    let key = hasRealConfiguredGroup ? `configured:${configured.groupKey}` : "";
    if (!key) {
      const registrantKey = makeRegistrantKey(player);
      const leagueKey = norm(player.leagueChoice);
      if (!registrantKey || !leagueKey) continue;
      key = `${registrantKey}::league:${leagueKey}`;
    }

    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(player);
  }

  const rows = Object.values(buckets)
    .filter((kids) => kids.length > 1)
    .flatMap((kids) => {
      const allNames = kids.map((kid) => kid.fullName);
      const registrantName = makeRegistrantName(kids[0]);
      const leagueChoice = kids[0].leagueChoice ?? "";

      return kids.map((kid) => ({
        registrantName,
        leagueChoice,
        playerId: kid.id,
        playerName: kid.fullName,
        siblingNames: allNames.filter((name) => name !== kid.fullName).join(", "),
        draftCost: costByPlayerId.get(kid.id)?.draftCost ?? "",
      }));
    });

  return NextResponse.json({ draftEventId, rows });
}

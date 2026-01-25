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

function digitsOnly(v: string) {
  return v.replace(/[^\d]/g, "");
}

function makeGroupKey(p: { primaryEmail: string | null; primaryPhone: string | null; guardian1Name: string | null }) {
  const email = norm(p.primaryEmail);
  if (email) return `email:${email}`;

  const phone = digitsOnly(norm(p.primaryPhone));
  if (phone) return `phone:${phone}`;

  const enroller = norm(p.guardian1Name);
  if (enroller) return `enroller:${enroller}`;

  return "";
}

export async function GET() {
  const draftEventId = await latestEventId();

  const players = await prisma.draftPlayer.findMany({
    where: { draftEventId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      primaryEmail: true,
      primaryPhone: true,
      guardian1Name: true,
      isDraftEligible: true,
      wantsU13: true,
    },
  });

  const groups: Record<string, typeof players> = {};

  for (const p of players) {
    if (!p.isDraftEligible || !p.wantsU13) continue;
    const key = makeGroupKey(p);
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const siblingGroups = Object.entries(groups)
    .filter(([, kids]) => kids.length > 1)
    .map(([groupKey, kids]) => ({
      groupKey,
      players: [...kids, ...kids].map((k) => ({
        id: k.id,
        firstName: k.firstName,
        lastName: k.lastName,
        fullName: k.fullName,
        primaryEmail: k.primaryEmail,
        primaryPhone: k.primaryPhone,
      })),
    }));

  const costs = await prisma.siblingDraftCost.findMany({
    where: { draftEventId },
  });

  const costByKey = Object.fromEntries(costs.map((c) => [c.groupKey, c.draftCost]));

  return NextResponse.json({
    draftEventId,
    groups: siblingGroups.map((g) => ({
      groupKey: g.groupKey,
      draftCost: costByKey[g.groupKey] ?? null,
      players: g.players,
    })),
  });
}

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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const eligible = url.searchParams.get("eligible");
  const drafted = url.searchParams.get("drafted");

  const draftEventId = await latestEventId();

  const where: any = { draftEventId };

  if (eligible === "true") where.isDraftEligible = true;
  if (eligible === "false") where.isDraftEligible = false;

  if (drafted === "true") where.isDrafted = true;
  if (drafted === "false") where.isDrafted = false;

  const players = await prisma.draftPlayer.findMany({
    where,
    orderBy: [{ isDrafted: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      registrationId: true,
      firstName: true,
      lastName: true,
      fullName: true,
      gender: true,
      dob: true,
      birthYear: true,
      leagueChoice: true,
      wantsU13: true,
      jerseySize: true,
      guardian1Name: true,
      guardian2Name: true,
      primaryPhone: true,
      primaryEmail: true,
      experience: true,
      rank: true,
      spring2025Rating: true,
      fall2025Rating: true,
      notes: true,
      isDraftEligible: true,
      isDrafted: true,
      draftedAt: true,
      draftedTeam: { select: { name: true, order: true } },
    },
  });

  return NextResponse.json({ draftEventId, players });
}

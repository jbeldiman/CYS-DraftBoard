import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { activateDraftEvent, getActiveDraftEvent } from "@/lib/activeDraftEvent";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

async function eventList() {
  const events = await prisma.draftEvent.findMany({
    orderBy: [{ seasonYear: "desc" }, { season: "desc" }, { division: "asc" }, { scheduledAt: "desc" }],
    include: { _count: { select: { players: true, teams: true, picks: true } } },
  });

  const active = await getActiveDraftEvent();
  return {
    events: events.map((event) => ({
      id: event.id,
      name: event.name,
      slug: event.slug,
      seasonYear: event.seasonYear,
      season: event.season,
      division: event.division,
      phase: event.phase,
      isActive: event.id === active?.id,
      scheduledAt: event.scheduledAt,
      scheduledDateKnown: event.scheduledDateKnown,
      counts: event._count,
    })),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await eventList());
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  try {
    if (action === "ensure-fall-2026") {
      const definitions = [
        { slug: "fall-2026-u11", name: "Fall 2026 U11 Draft", division: "U11" as const },
        { slug: "fall-2026-u13", name: "Fall 2026 U13 Draft", division: "U13" as const },
      ];

      await prisma.$transaction(
        definitions.map((definition) =>
          prisma.draftEvent.upsert({
            where: { slug: definition.slug },
            update: {
              name: definition.name,
              seasonYear: 2026,
              season: "FALL",
              division: definition.division,
            },
            create: {
              ...definition,
              seasonYear: 2026,
              season: "FALL",
              scheduledAt: new Date("2026-08-01T12:00:00.000Z"),
              scheduledDateKnown: false,
              phase: "SETUP",
              isPaused: true,
              currentPick: 1,
              pickClockSeconds: 120,
              isActive: false,
            },
          })
        )
      );

      return NextResponse.json({ ok: true, ...(await eventList()) });
    }

    if (action === "activate") {
      const eventId = String(body?.eventId ?? "").trim();
      if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
      await activateDraftEvent(eventId);
      return NextResponse.json({ ok: true, ...(await eventList()) });
    }

    if (action === "archive") {
      const eventId = String(body?.eventId ?? "").trim();
      if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
      const event = await prisma.draftEvent.findUnique({ where: { id: eventId } });
      if (!event) return NextResponse.json({ error: "Draft event not found" }, { status: 404 });
      if (event.phase === "LIVE") {
        return NextResponse.json({ error: "Stop the live draft before archiving it." }, { status: 409 });
      }
      await prisma.draftEvent.update({
        where: { id: eventId },
        data: { phase: "ARCHIVED", archivedAt: new Date(), isActive: false, isPaused: true, clockEndsAt: null },
      });

      if (event.isActive) {
        const nextEvent = await prisma.draftEvent.findFirst({
          where: { phase: { not: "ARCHIVED" } },
          orderBy: [{ seasonYear: "desc" }, { season: "desc" }, { division: "desc" }, { updatedAt: "desc" }],
          select: { id: true },
        });
        if (nextEvent) await activateDraftEvent(nextEvent.id);
      }

      return NextResponse.json({ ok: true, ...(await eventList()) });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Event update failed" }, { status: 400 });
  }
}

import { prisma } from "@/lib/prisma";

type DraftEventDb = Pick<typeof prisma, "draftEvent">;

const fallbackOrder = [
  { updatedAt: "desc" as const },
  { scheduledAt: "desc" as const },
  { createdAt: "desc" as const },
];

export async function getActiveDraftEvent(db: DraftEventDb = prisma) {
  const explicitlyActive = await db.draftEvent.findFirst({
    where: { isActive: true, phase: { not: "ARCHIVED" } },
  });
  if (explicitlyActive) return explicitlyActive;

  const live = await db.draftEvent.findFirst({
    where: { phase: "LIVE" },
    orderBy: fallbackOrder,
  });
  if (live) return live;

  return db.draftEvent.findFirst({
    where: { phase: { not: "ARCHIVED" } },
    orderBy: fallbackOrder,
  });
}

export async function getActiveDraftEventId(db: DraftEventDb = prisma) {
  return (await getActiveDraftEvent(db))?.id ?? null;
}

export async function requireActiveDraftEvent(db: DraftEventDb = prisma) {
  const event = await getActiveDraftEvent(db);
  if (!event) throw new Error("No active draft event found.");
  return event;
}

export async function requireActiveDraftEventId(db: DraftEventDb = prisma) {
  return (await requireActiveDraftEvent(db)).id;
}

export async function getOrCreateActiveDraftEvent(db: DraftEventDb = prisma) {
  const existing = await getActiveDraftEvent(db);
  if (existing) return existing;

  // Prevent an old archived event from retaining the one allowed active flag.
  await db.draftEvent.updateMany({ where: { isActive: true }, data: { isActive: false } });

  return db.draftEvent.create({
    data: {
      name: "CYS Draft Night",
      scheduledAt: new Date(Date.UTC(2026, 1, 16, 23, 0, 0)),
      scheduledDateKnown: false,
      phase: "SETUP",
      currentPick: 1,
      pickClockSeconds: 120,
      isPaused: true,
      isActive: true,
    },
  });
}

export async function activateDraftEvent(eventId: string) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.draftEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new Error("Draft event not found.");
    if (event.phase === "ARCHIVED") throw new Error("Archived drafts cannot be made active.");

    const otherLiveEvent = await tx.draftEvent.findFirst({
      where: { id: { not: eventId }, phase: "LIVE" },
      select: { name: true },
    });
    if (otherLiveEvent) {
      throw new Error(`Stop ${otherLiveEvent.name} before switching to another draft.`);
    }

    await tx.draftEvent.updateMany({ where: { isActive: true }, data: { isActive: false } });
    return tx.draftEvent.update({ where: { id: eventId }, data: { isActive: true } });
  });
}

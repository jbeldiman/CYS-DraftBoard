import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i += 1;
          continue;
        }
      } else {
        field += c;
        i += 1;
        continue;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (c === ",") {
        pushField();
        i += 1;
        continue;
      }
      if (c === "\r") {
        i += 1;
        continue;
      }
      if (c === "\n") {
        pushField();
        pushRow();
        i += 1;
        continue;
      }
      field += c;
      i += 1;
    }
  }

  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) pushRow();

  return rows;
}

function norm(s: any): string {
  return (s ?? "").toString().trim();
}

function normalizeName(s: string): string {
  const raw = norm(s).toLowerCase();
  const deaccent = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return deaccent
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function latestEvent() {
  const e = await prisma.draftEvent.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, phase: true },
  });

  if (e) return e;

  const created = await prisma.draftEvent.create({
    data: {
      name: "CYS Draft Night",
      scheduledAt: new Date(Date.UTC(2026, 1, 16, 23, 0, 0)),
      phase: "SETUP",
      currentPick: 1,
      pickClockSeconds: 120,
      isPaused: true,
    },
    select: { id: true, phase: true },
  });

  return created;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const event = await latestEvent();

    if (event.phase !== "SETUP") {
      return NextResponse.json(
        { error: "Draft is LIVE. Ratings upload is locked. Stop the draft to unlock uploads." },
        { status: 409 }
      );
    }

    const url = new URL(req.url);
    const seasonFromQuery = norm(url.searchParams.get("season")).toLowerCase();

    const form = await req.formData();
    const file = form.get("file");
    const seasonFromForm = norm(form.get("season")).toLowerCase();

    const season = seasonFromForm || seasonFromQuery;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (season !== "spring2025" && season !== "fall2025") {
      return NextResponse.json({ error: "Missing or invalid season (spring2025 | fall2025)" }, { status: 400 });
    }

    const text = await file.text();
    const matrix = parseCsv(text);

    if (matrix.length < 1) return NextResponse.json({ error: "CSV appears empty" }, { status: 400 });

    const draftEventId = event.id;

    const existing = await prisma.draftPlayer.findMany({
      where: { draftEventId },
      select: { id: true, fullName: true },
    });

    const idByName = new Map<string, string>();
    for (const p of existing) {
      const k = normalizeName(p.fullName);
      if (k) idByName.set(k, p.id);
    }

    let processed = 0;
    let updated = 0;
    let notFound = 0;

    const ops: any[] = [];

    for (const r of matrix) {
      const name = norm(r?.[0]);
      const ratingRaw = norm(r?.[1]);

      if (!name) continue;

      const rating = ratingRaw === "" ? null : Number(ratingRaw);
      if (rating !== null && !Number.isFinite(rating)) continue;

      processed += 1;

      const id = idByName.get(normalizeName(name));
      if (!id) {
        notFound += 1;
        continue;
      }

      ops.push(
        prisma.draftPlayer.update({
          where: { id },
          data: season === "spring2025" ? { spring2025Rating: rating } : { fall2025Rating: rating },
        })
      );
      updated += 1;
    }

    if (ops.length) {
      await prisma.$transaction(ops);
    }

    return NextResponse.json({
      ok: true,
      season,
      processed,
      updated,
      notFound,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ? String(err.message) : "Import failed" }, { status: 500 });
  }
}

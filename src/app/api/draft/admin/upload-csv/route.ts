import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

const DOB_MIN = new Date("2012-12-01T00:00:00.000Z");
const DOB_MAX = new Date("2016-12-31T23:59:59.999Z");

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

function wantsU13FromRow(row: Record<string, string>): boolean {
  const leagueInfo = norm(row["League Information - What league are you wanting your child to participate in?"]).toLowerCase();
  const ageGroup = norm(row["Age Group"]).toLowerCase();

  const playUpKeys = [
    "BU",
    "Playing Up",
    "Playing up",
    "Will your player be playing up to U13?",
    "League Information - Will your player be playing up to U13?",
    "League Information - Are you playing up to U13?",
    "U13",
    "u13",
  ];

  const playUpBlob = playUpKeys.map((k) => norm(row[k])).join(" ").toLowerCase();

  return (
    leagueInfo.includes("u13") ||
    ageGroup.includes("u13") ||
    playUpBlob.includes("u13") ||
    playUpBlob.includes("yes") ||
    playUpBlob.includes("true")
  );
}

function jerseyFromRow(row: Record<string, string>): string | null {
  const keys = ["Jersey Size", "Jersey size", "Shirt Size", "Shirt size", "Uniform Size", "Uniform size"];
  for (const k of keys) {
    const v = norm(row[k]);
    if (v) return v;
  }
  return null;
}

function primaryPhoneFromRow(row: Record<string, string>): string | null {
  const keys = [
    "Guardian 1 Mobile Phone Number",
    "Guardian 1 Mobile Phone",
    "Guardian 1 Phone",
    "Guardian 1 Phone Number",
    "Parent 1 Mobile Phone Number",
    "Parent 1 Phone",
    "Parent Phone",
    "Parent phone",
    "Primary Phone",
    "Primary phone",
    "Phone",
    "Mobile Phone",
    "Mobile phone",
    "Guardian Phone",
    "Guardian phone",
  ];
  for (const k of keys) {
    const v = norm(row[k]);
    if (v) return v;
  }
  return null;
}

function primaryEmailFromRow(row: Record<string, string>): string | null {
  const keys = [
    "Guardian 1 Email Address",
    "Guardian 1 Email",
    "Guardian Email Address",
    "Guardian Email",
    "Parent 1 Email Address",
    "Parent 1 Email",
    "Parent Email",
    "Parent email",
    "Primary Email",
    "Primary email",
    "Email",
    "Email Address",
  ];
  for (const k of keys) {
    const v = norm(row[k]);
    if (v) return v;
  }
  return null;
}

function guardianNameFromRow(row: Record<string, string>, which: 1 | 2): string | null {
  const directKeys =
    which === 1
      ? ["Parent 1 Name", "Guardian 1 Name", "Primary Guardian Name", "Primary Parent Name"]
      : ["Parent 2 Name", "Guardian 2 Name", "Secondary Guardian Name", "Secondary Parent Name"];

  for (const k of directKeys) {
    const v = norm(row[k]);
    if (v) return v;
  }

  const firstKeys =
    which === 1
      ? ["Guardian 1 First Name", "Parent 1 First Name", "Primary Guardian First Name", "Primary Parent First Name"]
      : ["Guardian 2 First Name", "Parent 2 First Name", "Secondary Guardian First Name", "Secondary Parent First Name"];

  const lastKeys =
    which === 1
      ? ["Guardian 1 Last Name", "Parent 1 Last Name", "Primary Guardian Last Name", "Primary Parent Last Name"]
      : ["Guardian 2 Last Name", "Parent 2 Last Name", "Secondary Guardian Last Name", "Secondary Parent Last Name"];

  let first = "";
  let last = "";

  for (const k of firstKeys) {
    const v = norm(row[k]);
    if (v) {
      first = v;
      break;
    }
  }

  for (const k of lastKeys) {
    const v = norm(row[k]);
    if (v) {
      last = v;
      break;
    }
  }

  const joined = `${first} ${last}`.trim();
  return joined ? joined : null;
}

function parseDateOnlyToUTCNoon(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (mdy) {
    const mm = Number(mdy[1]);
    const dd = Number(mdy[2]);
    let yy = Number(mdy[3]);
    if (yy < 100) yy += 2000;
    if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yy)) return null;
    return new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0));
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const yy = Number(iso[1]);
    const mm = Number(iso[2]);
    const dd = Number(iso[3]);
    return new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0));
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
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

const PARENTS_COMMENT_HEADER =
  "Experience: Tell us about your player. How many seasons have they played soccer? What positions do they like to play?";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const event = await latestEvent();

    if (event.phase !== "SETUP") {
      return NextResponse.json(
        { error: "Draft is LIVE. CSV upload is locked. Stop the draft to unlock uploads." },
        { status: 409 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const text = await file.text();
    const matrix = parseCsv(text);
    if (matrix.length < 2) return NextResponse.json({ error: "CSV appears empty" }, { status: 400 });

    const header = matrix[0].map((h) => norm(h));
    const rows = matrix.slice(1);

    const objects: Record<string, string>[] = [];
    for (const r of rows) {
      const obj: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) obj[header[i]] = r[i] ?? "";
      objects.push(obj);
    }

    const expIdx = header.findIndex((h) => h.toLowerCase() === PARENTS_COMMENT_HEADER.toLowerCase());
    const draftEventId = event.id;

    const toCreate: any[] = [];
    const regIds: string[] = [];
    const seen = new Set<string>();

    let total = 0;
    let eligible = 0;

    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      const rawRow = rows[i] ?? [];
      total += 1;

      const registrationId =
        norm(o["Registration ID"]) ||
        norm(o["Registration Id"]) ||
        norm(o["RegistrationID"]) ||
        norm(o["Registration"]) ||
        null;

      const firstName = norm(o["First Name"]) || norm(o["Player First Name"]) || norm(o["Participant First Name"]);
      const lastName = norm(o["Last Name"]) || norm(o["Player Last Name"]) || norm(o["Participant Last Name"]);
      if (!firstName || !lastName) continue;

      const fullName = `${firstName} ${lastName}`.trim();

      const dobRaw = o["DOB"] ?? o["Date of Birth"] ?? o["Birthdate"] ?? "";
      const dob = parseDateOnlyToUTCNoon(dobRaw);

      const birthYearRaw = norm(o["Birth Year"]);
      const birthYear = birthYearRaw ? Number(birthYearRaw) : dob ? dob.getUTCFullYear() : null;

      const gender = norm(o["Gender"]) || null;

      const leagueChoice =
        norm(o["League Information - What league are you wanting your child to participate in?"]) ||
        norm(o["League Choice"]) ||
        norm(o["League"]) ||
        norm(o["Age Group"]) ||
        null;

      const wantsU13 = wantsU13FromRow(o);
      const jerseySize = jerseyFromRow(o);

      const guardian1Name = guardianNameFromRow(o, 1);
      const guardian2Name = guardianNameFromRow(o, 2);

      const primaryEmail = primaryEmailFromRow(o);
      const primaryPhone = primaryPhoneFromRow(o);

      const eligibleDob = !!dob && dob.getTime() >= DOB_MIN.getTime() && dob.getTime() <= DOB_MAX.getTime();
      const isDraftEligible = eligibleDob && wantsU13;
      if (isDraftEligible) eligible += 1;

      const parentsComment =
        norm(o[PARENTS_COMMENT_HEADER]) ||
        (expIdx >= 0 ? norm(rawRow[expIdx] ?? "") : "") ||
        (rawRow[73] ? norm(rawRow[73]) : "") ||
        null;

      const dedupeKey =
        registrationId
          ? `rid:${registrationId}`
          : `nm:${firstName}|${lastName}|${dob ? dob.toISOString().slice(0, 10) : ""}`;

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      if (registrationId) regIds.push(registrationId);

      toCreate.push({
        draftEventId,
        registrationId,
        firstName,
        lastName,
        fullName,
        gender,
        dob,
        birthYear: Number.isFinite(birthYear as any) ? (birthYear as number) : null,
        leagueChoice,
        wantsU13,
        jerseySize,
        guardian1Name,
        guardian2Name,
        primaryPhone,
        primaryEmail,
        experience: parentsComment,
        isDraftEligible,
        isDrafted: false,
        draftedTeamId: null,
        draftedAt: null,
        rank: null,
      });
    }

    if (toCreate.length === 0) {
      return NextResponse.json({ error: "No valid player rows found to import" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.draftPick.deleteMany({ where: { draftEventId } });
      await tx.draftPlayer.deleteMany({ where: { draftEventId } });

      if (regIds.length) {
        await tx.draftPlayer.deleteMany({ where: { registrationId: { in: regIds } } });
      }

      await tx.draftEvent.update({
        where: { id: draftEventId },
        data: {
          phase: "SETUP",
          currentPick: 1,
          isPaused: true,
          clockEndsAt: null,
          pauseRemainingSecs: null,
        },
      });

      await tx.draftPlayer.createMany({ data: toCreate });
    });

    return NextResponse.json({
      ok: true,
      processed: toCreate.length,
      totalRows: total,
      eligibleRows: eligible,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ? String(err.message) : "Upload failed" }, { status: 500 });
  }
}
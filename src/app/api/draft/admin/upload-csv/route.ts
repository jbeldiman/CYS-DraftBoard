import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import {
  normalizeDisplayName,
  normalizePlayerName,
  parseDateOnlyToUTCNoon,
  permanentPlayerIdentityKey,
  splitPlayerName,
  utcDateKey,
} from "@/lib/playerIdentity";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") pushField();
    else if (char === "\n") {
      pushField();
      pushRow();
    } else if (char !== "\r") field += char;
  }

  pushField();
  if (row.length > 1 || row[0] !== "") pushRow();
  return rows;
}

function normalizedHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseBoolean(value: unknown) {
  return ["true", "yes", "y", "1"].includes(String(value ?? "").trim().toLowerCase());
}

function valueFor(row: Record<string, string>, ...names: string[]) {
  for (const name of names) {
    const value = normalizeDisplayName(row[normalizedHeader(name)]);
    if (value) return value;
  }
  return "";
}

type ParsedPlayer = {
  rowNumber: number;
  identityKey: string;
  normalizedName: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dob: Date;
  rating: number;
  gender: string | null;
  guardian1Name: string | null;
  guardian2Name: string | null;
  guardian2Phone: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  jerseySize: string | null;
  experience: string | null;
  notes: string | null;
  isGoalie: boolean;
  siblingNames: string[];
};

function parseSeasonFile(text: string) {
  const matrix = parseCsv(text);
  if (matrix.length < 2) throw new Error("CSV appears empty.");

  const headers = matrix[0].map(normalizedHeader);
  const required = ["player", "rating", "date of birth"];
  const missing = required.filter((name) => !headers.includes(normalizedHeader(name)));
  if (missing.length) throw new Error(`CSV is missing required column(s): ${missing.join(", ")}.`);

  const errors: string[] = [];
  const warnings: string[] = [];
  const players: ParsedPlayer[] = [];
  const identityKeys = new Set<string>();

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const raw = matrix[rowIndex];
    if (!raw.some((cell) => String(cell ?? "").trim())) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = raw[index] ?? "";
    });

    const rowNumber = rowIndex + 1;
    const fullName = valueFor(row, "Player", "Full Name");
    const dob = parseDateOnlyToUTCNoon(valueFor(row, "Date of Birth", "DOB"));
    const ratingText = valueFor(row, "Rating");
    const rating = Number(ratingText);

    if (!fullName) {
      errors.push(`Row ${rowNumber}: Player is required.`);
      continue;
    }
    if (!dob) {
      errors.push(`Row ${rowNumber}: ${fullName} has an invalid or missing Date of Birth.`);
      continue;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      errors.push(`Row ${rowNumber}: ${fullName} must have a whole-number rating from 1 through 5.`);
      continue;
    }

    const { firstName, lastName } = splitPlayerName(fullName);
    if (!firstName || !lastName) {
      errors.push(`Row ${rowNumber}: ${fullName} must include a first and last name.`);
      continue;
    }

    const identityKey = permanentPlayerIdentityKey(fullName, dob);
    if (identityKeys.has(identityKey)) {
      errors.push(`Row ${rowNumber}: ${fullName} and ${utcDateKey(dob)} appear more than once.`);
      continue;
    }
    identityKeys.add(identityKey);

    const siblingNames: string[] = [valueFor(row, "Sibling 1"), valueFor(row, "Sibling 2")]
      .map((value) => normalizeDisplayName(value))
      .filter((value): value is string => Boolean(value));
    if (siblingNames.some((name) => normalizePlayerName(name) === normalizePlayerName(fullName))) {
      errors.push(`Row ${rowNumber}: ${fullName} cannot be listed as their own sibling.`);
    }

    players.push({
      rowNumber,
      identityKey,
      normalizedName: normalizePlayerName(fullName),
      firstName,
      lastName,
      fullName: normalizeDisplayName(fullName),
      dob,
      rating,
      gender: valueFor(row, "Gender") || null,
      guardian1Name: valueFor(row, "Parent", "Guardian") || null,
      guardian2Name: valueFor(row, "Second Parent", "Guardian 2") || null,
      guardian2Phone: valueFor(row, "Second Parent Phone", "Guardian 2 Phone") || null,
      primaryPhone: valueFor(row, "Parent Phone", "Primary Phone") || null,
      primaryEmail: valueFor(row, "Parent Email", "Primary Email") || null,
      jerseySize: valueFor(row, "Jersey Size") || null,
      experience: valueFor(row, "Experience") || null,
      notes: valueFor(row, "Parent Comment", "Notes") || null,
      isGoalie: parseBoolean(valueFor(row, "Goalie?", "Goalie")),
      siblingNames,
    });
  }

  const playersByName = new Map(players.map((player) => [player.normalizedName, player]));
  for (const player of players) {
    for (const siblingName of player.siblingNames) {
      if (!playersByName.has(normalizePlayerName(siblingName))) {
        warnings.push(`${player.fullName}: sibling ${siblingName} is not in this CSV.`);
      }
    }
  }

  return { players, errors, warnings };
}

function buildSiblingGroups(players: ParsedPlayer[]) {
  const byName = new Map(players.map((player) => [player.normalizedName, player]));
  const neighbors = new Map<string, Set<string>>();
  for (const player of players) neighbors.set(player.normalizedName, new Set());

  for (const player of players) {
    for (const siblingName of player.siblingNames) {
      const siblingKey = normalizePlayerName(siblingName);
      if (!byName.has(siblingKey) || siblingKey === player.normalizedName) continue;
      neighbors.get(player.normalizedName)?.add(siblingKey);
      neighbors.get(siblingKey)?.add(player.normalizedName);
    }
  }

  const groups: string[][] = [];
  const visited = new Set<string>();
  for (const name of neighbors.keys()) {
    if (visited.has(name) || !neighbors.get(name)?.size) continue;
    const stack = [name];
    const group: string[] = [];
    visited.add(name);
    while (stack.length) {
      const current = stack.pop()!;
      group.push(current);
      for (const next of neighbors.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    if (group.length > 1) groups.push(group.sort());
  }
  return groups;
}

async function preparePlan(eventId: string, text: string) {
  const event = await prisma.draftEvent.findUnique({
    where: { id: eventId },
    include: { _count: { select: { players: true, picks: true } } },
  });
  if (!event) throw new Error("Draft event not found.");
  if (event.phase === "ARCHIVED") throw new Error("Archived drafts cannot receive player imports.");

  const parsed = parseSeasonFile(text);
  const names = [...new Set(parsed.players.map((player) => player.normalizedName))];
  const profiles = await prisma.permanentPlayer.findMany({
    where: { OR: [{ identityKey: { in: parsed.players.map((player) => player.identityKey) } }, { normalizedName: { in: names } }] },
  });

  const exactByKey = new Map(profiles.map((profile) => [profile.identityKey, profile]));
  const byName = new Map<string, typeof profiles>();
  for (const profile of profiles) {
    const list = byName.get(profile.normalizedName) ?? [];
    list.push(profile);
    byName.set(profile.normalizedName, list);
  }

  const matches = parsed.players.map((player) => {
    const exact = exactByKey.get(player.identityKey);
    if (exact) return { player, kind: "RETURNING" as const, profile: exact };

    const sameName = byName.get(player.normalizedName) ?? [];
    const historical = sameName.filter((profile) => profile.dob === null);
    if (sameName.length === 1 && historical.length === 1) {
      return { player, kind: "HISTORY_UPGRADE" as const, profile: historical[0] };
    }

    if (sameName.length === 1 && sameName[0].dob) {
      const existingDob = new Date(sameName[0].dob);
      const differenceDays = Math.abs(existingDob.getTime() - player.dob.getTime()) / 86_400_000;
      if (differenceDays <= 1) {
        parsed.warnings.push(
          `${player.fullName}: DOB will be corrected from ${utcDateKey(existingDob)} to ${utcDateKey(player.dob)} and prior history will stay linked.`
        );
        return { player, kind: "DOB_CORRECTION" as const, profile: sameName[0] };
      }
      parsed.errors.push(
        `${player.fullName}: existing DOB is ${utcDateKey(existingDob)}, but the CSV says ${utcDateKey(player.dob)}. Review this player before importing.`
      );
      return { player, kind: "CONFLICT" as const, profile: sameName[0] };
    }

    if (sameName.length > 1) {
      parsed.errors.push(`${player.fullName}: multiple permanent players use this name. Review the match before importing.`);
      return { player, kind: "CONFLICT" as const, profile: sameName[0] ?? null };
    }

    return { player, kind: "NEW" as const, profile: null };
  });

  const matchedProfileIds = matches.flatMap((match) => (match.profile ? [match.profile.id] : []));
  const existingEntries = matchedProfileIds.length
    ? await prisma.draftPlayer.findMany({
        where: { draftEventId: event.id, permanentPlayerId: { in: matchedProfileIds } },
        select: { id: true, permanentPlayerId: true },
      })
    : [];
  const existingByProfileId = new Map(existingEntries.map((entry) => [entry.permanentPlayerId, entry]));

  const newSeasonEntries = matches.filter((match) => !match.profile || !existingByProfileId.has(match.profile.id)).length;
  const updatedSeasonEntries = matches.length - newSeasonEntries;
  const existingPlayersNotInFile = Math.max(0, event._count.players - updatedSeasonEntries);
  if (existingPlayersNotInFile > 0) {
    parsed.warnings.push(
      `${existingPlayersNotInFile} existing player record(s) in this event are not present in the file and will be preserved.`
    );
  }

  const canApply =
    parsed.errors.length === 0 &&
    event.phase === "SETUP" &&
    event._count.picks === 0 &&
    parsed.players.length > 0;

  return {
    event,
    parsed,
    matches,
    summary: {
      rows: parsed.players.length,
      returningPlayers: matches.filter((match) => match.kind === "RETURNING").length,
      historicalPlayersUpgraded: matches.filter((match) => match.kind === "HISTORY_UPGRADE").length,
      dobCorrections: matches.filter((match) => match.kind === "DOB_CORRECTION").length,
      identityConflicts: matches.filter((match) => match.kind === "CONFLICT").length,
      newPermanentPlayers: matches.filter((match) => match.kind === "NEW").length,
      newSeasonEntries,
      updatedSeasonEntries,
      existingPlayersPreserved: existingPlayersNotInFile,
      siblingGroups: buildSiblingGroups(parsed.players).length,
      errors: parsed.errors.length,
      warnings: parsed.warnings.length,
    },
    canApply,
  };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    const eventId = String(form.get("eventId") ?? "").trim();
    const mode = String(form.get("mode") ?? "preview").trim().toLowerCase();

    if (!eventId) return NextResponse.json({ error: "Choose a draft event first." }, { status: 400 });
    if (!file || !(file instanceof File)) return NextResponse.json({ error: "Choose a CSV file." }, { status: 400 });
    if (!['preview', 'apply'].includes(mode)) return NextResponse.json({ error: "Invalid import mode." }, { status: 400 });

    const text = await file.text();
    const fileHash = createHash("sha256").update(text).digest("hex");
    const plan = await preparePlan(eventId, text);

    const responseBase = {
      ok: true,
      mode,
      fileName: file.name,
      fileHash,
      event: {
        id: plan.event.id,
        name: plan.event.name,
        phase: plan.event.phase,
        division: plan.event.division,
        season: plan.event.season,
        seasonYear: plan.event.seasonYear,
      },
      summary: plan.summary,
      errors: plan.parsed.errors,
      warnings: plan.parsed.warnings,
      canApply: plan.canApply,
    };

    if (mode === "preview") return NextResponse.json(responseBase);
    if (!plan.canApply) {
      return NextResponse.json(
        {
          ...responseBase,
          error:
            plan.event.phase !== "SETUP"
              ? "The selected event must be in SETUP before importing."
              : plan.event._count.picks > 0
                ? "This event already has draft picks. Import is blocked to protect draft results."
                : "Fix the CSV errors before importing.",
        },
        { status: 409 }
      );
    }

    const siblingGroups = buildSiblingGroups(plan.parsed.players);
    const result = await prisma.$transaction(async (tx) => {
      const playerIdsByName = new Map<string, string>();
      let createdProfiles = 0;
      let upgradedProfiles = 0;
      let correctedProfiles = 0;
      let createdEntries = 0;
      let updatedEntries = 0;

      for (const match of plan.matches) {
        let profile = match.profile;
        if (match.kind === "NEW") {
          profile = await tx.permanentPlayer.create({
            data: {
              identityKey: match.player.identityKey,
              firstName: match.player.firstName,
              lastName: match.player.lastName,
              fullName: match.player.fullName,
              normalizedName: match.player.normalizedName,
              dob: match.player.dob,
            },
          });
          createdProfiles += 1;
        } else if (match.kind === "HISTORY_UPGRADE" || match.kind === "DOB_CORRECTION") {
          profile = await tx.permanentPlayer.update({
            where: { id: match.profile!.id },
            data: {
              identityKey: match.player.identityKey,
              firstName: match.player.firstName,
              lastName: match.player.lastName,
              fullName: match.player.fullName,
              normalizedName: match.player.normalizedName,
              dob: match.player.dob,
            },
          });
          if (match.kind === "HISTORY_UPGRADE") upgradedProfiles += 1;
          else correctedProfiles += 1;
        } else if (match.kind === "CONFLICT") {
          throw new Error(`Resolve the permanent-player conflict for ${match.player.fullName} before importing.`);
        }
        if (!profile) throw new Error(`Could not resolve permanent player for ${match.player.fullName}.`);

        const existing = await tx.draftPlayer.findFirst({
          where: { draftEventId: plan.event.id, permanentPlayerId: profile.id },
          select: { id: true },
        });

        const data = {
          permanentPlayerId: profile.id,
          firstName: match.player.firstName,
          lastName: match.player.lastName,
          fullName: match.player.fullName,
          gender: match.player.gender,
          dob: match.player.dob,
          birthYear: match.player.dob.getUTCFullYear(),
          leagueChoice: plan.event.division,
          wantsU13: plan.event.division === "U13",
          jerseySize: match.player.jerseySize,
          guardian1Name: match.player.guardian1Name,
          guardian2Name: match.player.guardian2Name,
          guardian2Phone: match.player.guardian2Phone,
          primaryPhone: match.player.primaryPhone,
          primaryEmail: match.player.primaryEmail,
          experience: match.player.experience,
          notes: match.player.notes,
          rating: match.player.rating,
          isGoalie: match.player.isGoalie,
          isDraftEligible: true,
        };

        const entry = existing
          ? await tx.draftPlayer.update({ where: { id: existing.id }, data })
          : await tx.draftPlayer.create({ data: { draftEventId: plan.event.id, ...data } });

        if (existing) updatedEntries += 1;
        else createdEntries += 1;
        playerIdsByName.set(match.player.normalizedName, entry.id);
      }

      const importedPlayerIds = [...playerIdsByName.values()];
      if (importedPlayerIds.length) {
        // Reconcile only sibling configuration for players in this current SETUP import.
        // Players, picks, teams, and all historical events remain untouched.
        await tx.siblingDraftCost.deleteMany({
          where: { draftEventId: plan.event.id, playerId: { in: importedPlayerIds } },
        });
      }

      for (const group of siblingGroups) {
        const groupKey = `siblings:${createHash("sha256").update(group.join("|")).digest("hex").slice(0, 24)}`;
        for (const normalizedName of group) {
          const playerId = playerIdsByName.get(normalizedName);
          if (!playerId) continue;
          await tx.siblingDraftCost.create({
            data: { draftEventId: plan.event.id, playerId, groupKey, draftCost: null },
          });
        }
      }

      await tx.draftEvent.update({
        where: { id: plan.event.id },
        data: { sourceFile: file.name, sourceHash: fileHash },
      });

      return {
        createdProfiles,
        upgradedProfiles,
        correctedProfiles,
        createdEntries,
        updatedEntries,
        siblingGroups: siblingGroups.length,
      };
    }, {
      maxWait: 10_000,
      timeout: 60_000,
    });

    return NextResponse.json({ ...responseBase, applied: true, result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Import failed" }, { status: 500 });
  }
}

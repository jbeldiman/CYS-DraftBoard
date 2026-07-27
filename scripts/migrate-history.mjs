import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const HISTORY_SOURCES = [
  {
    slug: "spring-2025-u13",
    name: "Spring 2025 U13 Draft",
    seasonYear: 2025,
    season: "SPRING",
    division: "U13",
    filename: "Spring 2025 Draft Board.csv",
    // The original file does not contain the exact draft date.
    approximateDate: new Date("2025-01-01T12:00:00.000Z"),
  },
  {
    slug: "fall-2025-u13",
    name: "Fall 2025 U13 Draft",
    seasonYear: 2025,
    season: "FALL",
    division: "U13",
    filename: "Fall 2025 Draft Board.csv",
    // The original file does not contain the exact draft date.
    approximateDate: new Date("2025-07-01T12:00:00.000Z"),
  },
];

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDisplayName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function splitName(fullName) {
  const pieces = normalizeDisplayName(fullName).split(" ").filter(Boolean);
  if (pieces.length <= 1) {
    return { firstName: pieces[0] ?? "Unknown", lastName: "" };
  }
  return { firstName: pieces[0], lastName: pieces.slice(1).join(" ") };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
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

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushField();
      pushRow();
    } else if (char !== "\r") {
      field += char;
    }
  }

  pushField();
  if (row.length > 1 || row[0] !== "") pushRow();
  return rows;
}

function parseRating(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const rating = Number(text);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error(`Invalid historical rating: ${text}`);
  }
  return rating;
}

function parseHistoryCsv(config, csvText) {
  const matrix = parseCsv(csvText);
  if (!matrix.length) throw new Error(`${config.filename} is empty.`);

  const header = matrix[0] ?? [];
  const roundColumn = header.findIndex((cell) => normalizeName(cell) === "round");
  if (roundColumn < 0) throw new Error(`${config.filename} has no Round column.`);

  const teams = [];
  for (let column = 0; column < header.length; column += 1) {
    if (column === roundColumn) continue;
    const teamName = normalizeDisplayName(header[column]);
    if (teamName) teams.push({ column, name: teamName, order: teams.length + 1 });
  }
  if (!teams.length) throw new Error(`${config.filename} has no team columns.`);

  const ratings = new Map();
  const ratingsHeaderIndex = matrix.findIndex(
    (row) => normalizeName(row?.[0]) === "player" && normalizeName(row?.[1]) === "rating"
  );

  if (ratingsHeaderIndex >= 0) {
    for (const row of matrix.slice(ratingsHeaderIndex + 1)) {
      const playerName = normalizeDisplayName(row?.[0]);
      if (!playerName) continue;
      const key = normalizeName(playerName);
      if (!key) continue;
      if (ratings.has(key)) throw new Error(`${config.filename} contains duplicate rating rows for ${playerName}.`);
      ratings.set(key, parseRating(row?.[1]));
    }
  }

  const picks = [];
  const seenPlayers = new Set();
  const seenOverallNumbers = new Set();

  for (const row of matrix.slice(1)) {
    const roundText = String(row?.[roundColumn] ?? "").trim();
    if (!/^\d+$/.test(roundText)) continue;

    const round = Number(roundText);
    if (round <= 0) continue;
    const pickOrder = round % 2 === 1 ? teams : [...teams].reverse();

    for (let index = 0; index < pickOrder.length; index += 1) {
      const team = pickOrder[index];
      const fullName = normalizeDisplayName(row?.[team.column]);
      if (!fullName) continue;

      const normalizedName = normalizeName(fullName);
      const pickInRound = index + 1;
      const overallNumber = (round - 1) * teams.length + pickInRound;

      if (seenPlayers.has(normalizedName)) {
        throw new Error(`${config.filename} drafts ${fullName} more than once.`);
      }
      if (seenOverallNumbers.has(overallNumber)) {
        throw new Error(`${config.filename} contains duplicate overall pick ${overallNumber}.`);
      }

      seenPlayers.add(normalizedName);
      seenOverallNumbers.add(overallNumber);
      picks.push({
        fullName,
        normalizedName,
        teamName: team.name,
        teamOrder: team.order,
        round,
        pickInRound,
        overallNumber,
        rating: ratings.get(normalizedName) ?? null,
      });
    }
  }

  const missingRatings = picks.filter((pick) => pick.rating === null).map((pick) => pick.fullName);
  if (missingRatings.length) {
    throw new Error(
      `${config.filename} is missing ratings for ${missingRatings.length} drafted player(s): ${missingRatings
        .slice(0, 5)
        .join(", ")}${missingRatings.length > 5 ? "…" : ""}`
    );
  }

  return {
    ...config,
    teams,
    picks,
    sourceHash: createHash("sha256").update(csvText).digest("hex"),
    maxOverallNumber: picks.reduce((max, pick) => Math.max(max, pick.overallNumber), 0),
  };
}

function utcDateKey(date) {
  if (!date) return null;
  return new Date(date).toISOString().slice(0, 10);
}

function identityKeyForDraftPlayer(player) {
  const normalizedName = normalizeName(player.fullName || `${player.firstName} ${player.lastName}`);
  if (!normalizedName) throw new Error(`DraftPlayer ${player.id} has no usable name.`);
  if (player.dob) return `dob:${normalizedName}|${utcDateKey(player.dob)}`;
  return `history:${normalizedName}`;
}

function preferredRating(player) {
  return player.spring2026Rating ?? player.fall2025Rating ?? player.spring2025Rating ?? null;
}

function summarizeHistoricalEvent(existingEvent, source) {
  if (!existingEvent) return { status: "READY", detail: "Will create archived event" };

  const countsMatch =
    existingEvent._count.teams === source.teams.length &&
    existingEvent._count.players === source.picks.length &&
    existingEvent._count.picks === source.picks.length;
  const hashMatches = !existingEvent.sourceHash || existingEvent.sourceHash === source.sourceHash;

  if (countsMatch && hashMatches) return { status: "IMPORTED", detail: "Already complete; will leave unchanged" };
  return {
    status: "REVIEW",
    detail: `Existing event has ${existingEvent._count.teams} teams, ${existingEvent._count.players} players, and ${existingEvent._count.picks} picks`,
  };
}

async function loadSources() {
  const sources = [];
  for (const config of HISTORY_SOURCES) {
    const sourcePath = path.join(projectRoot, "public", "history", config.filename);
    const csvText = await fs.readFile(sourcePath, "utf8");
    sources.push(parseHistoryCsv(config, csvText));
  }
  return sources;
}

function planProfiles(existingProfiles, existingDraftPlayers, sources) {
  const profilesByKey = new Map(existingProfiles.map((profile) => [profile.identityKey, profile]));
  const profilesById = new Map(existingProfiles.map((profile) => [profile.id, profile]));
  const profilesByName = new Map();

  const addProfileToNameMap = (profile) => {
    const list = profilesByName.get(profile.normalizedName) ?? [];
    if (!list.some((item) => item.identityKey === profile.identityKey)) list.push(profile);
    profilesByName.set(profile.normalizedName, list);
  };

  for (const profile of existingProfiles) addProfileToNameMap(profile);

  const plannedProfiles = [];
  const ensureProfile = ({ identityKey, firstName, lastName, fullName, normalizedName, dob }) => {
    const existing = profilesByKey.get(identityKey);
    if (existing) return existing;

    const planned = {
      id: randomUUID(),
      identityKey,
      firstName,
      lastName,
      fullName,
      normalizedName,
      dob: dob ?? null,
    };
    profilesByKey.set(identityKey, planned);
    plannedProfiles.push(planned);
    addProfileToNameMap(planned);
    return planned;
  };

  const existingPlayerPlans = [];
  for (const player of existingDraftPlayers) {
    const fullName = normalizeDisplayName(player.fullName || `${player.firstName} ${player.lastName}`);
    const normalizedName = normalizeName(fullName);

    let profile = null;
    if (player.permanentPlayerId) {
      profile = profilesById.get(player.permanentPlayerId) ?? null;
      if (!profile) {
        throw new Error(`DraftPlayer ${player.id} references a permanent player that could not be loaded.`);
      }
    } else {
      const identityKey = identityKeyForDraftPlayer(player);
      profile = ensureProfile({
        identityKey,
        firstName: player.firstName,
        lastName: player.lastName,
        fullName,
        normalizedName,
        dob: player.dob,
      });
    }

    existingPlayerPlans.push({
      player,
      profileKey: profile.identityKey,
      rating: preferredRating(player),
    });
  }

  const historicalProfileKeyByName = new Map();
  let ambiguousHistoricalNames = 0;

  for (const source of sources) {
    for (const pick of source.picks) {
      if (historicalProfileKeyByName.has(pick.normalizedName)) continue;

      const matchingProfiles = profilesByName.get(pick.normalizedName) ?? [];
      if (matchingProfiles.length === 1) {
        historicalProfileKeyByName.set(pick.normalizedName, matchingProfiles[0].identityKey);
        continue;
      }

      if (matchingProfiles.length > 1) ambiguousHistoricalNames += 1;
      const { firstName, lastName } = splitName(pick.fullName);
      const profile = ensureProfile({
        identityKey: `history:${pick.normalizedName}`,
        firstName,
        lastName,
        fullName: pick.fullName,
        normalizedName: pick.normalizedName,
        dob: null,
      });
      historicalProfileKeyByName.set(pick.normalizedName, profile.identityKey);
    }
  }

  return {
    profilesByKey,
    plannedProfiles,
    existingPlayerPlans,
    historicalProfileKeyByName,
    ambiguousHistoricalNames,
  };
}

function findSpring2026Candidate(events) {
  const alreadyClassified = events.filter((event) => event.slug === "spring-2026-u13");
  if (alreadyClassified.length === 1) return alreadyClassified[0];
  if (alreadyClassified.length > 1) throw new Error("More than one event uses the spring-2026-u13 slug.");

  const candidates = events.filter(
    (event) => event.phase !== "ARCHIVED" && utcDateKey(event.scheduledAt) === "2026-02-16"
  );
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error("More than one active event is scheduled for 2026-02-16; Spring 2026 cannot be classified safely.");
  }
  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.");

  const sources = await loadSources();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const [events, existingProfiles, existingDraftPlayers] = await Promise.all([
      prisma.draftEvent.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          scheduledAt: true,
          phase: true,
          seasonYear: true,
          season: true,
          division: true,
          sourceHash: true,
          _count: { select: { teams: true, players: true, picks: true } },
        },
      }),
      prisma.permanentPlayer.findMany({
        select: {
          id: true,
          identityKey: true,
          firstName: true,
          lastName: true,
          fullName: true,
          normalizedName: true,
          dob: true,
        },
      }),
      prisma.draftPlayer.findMany({
        select: {
          id: true,
          permanentPlayerId: true,
          firstName: true,
          lastName: true,
          fullName: true,
          dob: true,
          spring2025Rating: true,
          fall2025Rating: true,
          spring2026Rating: true,
          rating: true,
        },
      }),
    ]);

    const spring2026Candidate = findSpring2026Candidate(events);
    const profilePlan = planProfiles(existingProfiles, existingDraftPlayers, sources);
    const eventSummaries = sources.map((source) => {
      const existing = events.find((event) => event.slug === source.slug);
      return { source, existing, summary: summarizeHistoricalEvent(existing, source) };
    });

    console.log("\nCYS historical draft migration preview\n");
    console.table(
      sources.map((source) => ({
        Event: source.name,
        Teams: source.teams.length,
        Players: source.picks.length,
        Ratings: source.picks.filter((pick) => pick.rating !== null).length,
        "Highest pick": source.maxOverallNumber,
        "SHA-256": source.sourceHash.slice(0, 12),
      }))
    );

    console.table(
      eventSummaries.map(({ source, summary }) => ({
        Event: source.name,
        Status: summary.status,
        Detail: summary.detail,
      }))
    );

    console.log(`Existing draft entries: ${existingDraftPlayers.length}`);
    console.log(`Existing permanent players: ${existingProfiles.length}`);
    console.log(`Permanent players to create: ${profilePlan.plannedProfiles.length}`);
    console.log(
      `Existing draft entries to link: ${profilePlan.existingPlayerPlans.filter((plan) => !plan.player.permanentPlayerId).length}`
    );
    console.log(`Ambiguous historical names kept separate for review: ${profilePlan.ambiguousHistoricalNames}`);
    console.log(
      `Spring 2026 event: ${spring2026Candidate ? `${spring2026Candidate.name} (${spring2026Candidate.id})` : "not automatically identified"}`
    );

    const unsafeEvents = eventSummaries.filter(({ summary }) => summary.status === "REVIEW");
    if (unsafeEvents.length) {
      throw new Error(
        `Historical migration stopped because ${unsafeEvents.length} existing event(s) are incomplete or do not match the source CSV.`
      );
    }

    if (!APPLY) {
      console.log("\nPreview only. No database rows were created, deleted, or changed.");
      console.log("Run `npm run history:migrate` after reviewing this output to apply the additive migration.\n");
      return;
    }

    const result = await prisma.$transaction(
      async (tx) => {
        if (profilePlan.plannedProfiles.length) {
          await tx.permanentPlayer.createMany({ data: profilePlan.plannedProfiles, skipDuplicates: true });
        }

        const allProfiles = await tx.permanentPlayer.findMany({
          select: { id: true, identityKey: true },
        });
        const profileIdByKey = new Map(allProfiles.map((profile) => [profile.identityKey, profile.id]));

        let linkedExistingPlayers = 0;
        let populatedExistingRatings = 0;
        for (const plan of profilePlan.existingPlayerPlans) {
          const permanentPlayerId = profileIdByKey.get(plan.profileKey);
          if (!permanentPlayerId) throw new Error(`Permanent player was not created for ${plan.player.fullName}.`);

          const data = {};
          if (!plan.player.permanentPlayerId) {
            data.permanentPlayerId = permanentPlayerId;
            linkedExistingPlayers += 1;
          }
          if (plan.player.rating === null && plan.rating !== null) {
            data.rating = plan.rating;
            populatedExistingRatings += 1;
          }
          if (Object.keys(data).length) {
            await tx.draftPlayer.update({ where: { id: plan.player.id }, data });
          }
        }

        if (spring2026Candidate) {
          const update = {};
          if (!spring2026Candidate.slug) update.slug = "spring-2026-u13";
          if (!spring2026Candidate.seasonYear) update.seasonYear = 2026;
          if (!spring2026Candidate.season) update.season = "SPRING";
          if (!spring2026Candidate.division) update.division = "U13";
          if (Object.keys(update).length) {
            await tx.draftEvent.update({ where: { id: spring2026Candidate.id }, data: update });
          }
        }

        const importedEvents = [];
        for (const { source, existing, summary } of eventSummaries) {
          if (existing && summary.status === "IMPORTED") {
            importedEvents.push({ slug: source.slug, status: "already imported" });
            continue;
          }

          const eventId = randomUUID();
          const teamIdByName = new Map(source.teams.map((team) => [team.name, randomUUID()]));
          const playerRows = [];
          const pickRows = [];

          for (const pick of source.picks) {
            const profileKey = profilePlan.historicalProfileKeyByName.get(pick.normalizedName);
            const permanentPlayerId = profileKey ? profileIdByKey.get(profileKey) : null;
            if (!permanentPlayerId) throw new Error(`No permanent player found for ${pick.fullName}.`);

            const teamId = teamIdByName.get(pick.teamName);
            if (!teamId) throw new Error(`No team found for ${pick.teamName}.`);

            const playerId = randomUUID();
            const { firstName, lastName } = splitName(pick.fullName);
            playerRows.push({
              id: playerId,
              draftEventId: eventId,
              permanentPlayerId,
              firstName,
              lastName,
              fullName: pick.fullName,
              leagueChoice: source.division,
              wantsU13: source.division === "U13",
              rating: pick.rating,
              spring2025Rating: source.season === "SPRING" ? pick.rating : null,
              fall2025Rating: source.season === "FALL" ? pick.rating : null,
              isDraftEligible: true,
              isDrafted: true,
              draftedTeamId: teamId,
              draftedAt: source.approximateDate,
              createdAt: source.approximateDate,
            });
            pickRows.push({
              id: randomUUID(),
              draftEventId: eventId,
              overallNumber: pick.overallNumber,
              round: pick.round,
              pickInRound: pick.pickInRound,
              teamId,
              playerId,
              madeAt: source.approximateDate,
            });
          }

          await tx.draftEvent.create({
            data: {
              id: eventId,
              name: source.name,
              slug: source.slug,
              scheduledAt: source.approximateDate,
              scheduledDateKnown: false,
              phase: "ARCHIVED",
              seasonYear: source.seasonYear,
              season: source.season,
              division: source.division,
              archivedAt: source.approximateDate,
              sourceFile: source.filename,
              sourceHash: source.sourceHash,
              currentPick: source.maxOverallNumber + 1,
              pickClockSeconds: 120,
              isPaused: true,
              createdAt: source.approximateDate,
            },
          });

          await tx.draftTeam.createMany({
            data: source.teams.map((team) => ({
              id: teamIdByName.get(team.name),
              draftEventId: eventId,
              name: team.name,
              order: team.order,
              createdAt: source.approximateDate,
            })),
          });
          await tx.draftPlayer.createMany({ data: playerRows });
          await tx.draftPick.createMany({ data: pickRows });

          importedEvents.push({ slug: source.slug, status: "created" });
        }

        return { linkedExistingPlayers, populatedExistingRatings, importedEvents };
      },
      { maxWait: 10_000, timeout: 60_000 }
    );

    const verification = await prisma.draftEvent.findMany({
      where: { slug: { in: HISTORY_SOURCES.map((source) => source.slug) } },
      orderBy: [{ seasonYear: "asc" }, { season: "asc" }],
      select: {
        name: true,
        slug: true,
        phase: true,
        sourceHash: true,
        _count: { select: { teams: true, players: true, picks: true } },
      },
    });

    console.log("\nMigration applied successfully.");
    console.log(`Existing draft entries linked: ${result.linkedExistingPlayers}`);
    console.log(`Existing generic ratings populated: ${result.populatedExistingRatings}`);
    console.table(
      verification.map((event) => ({
        Event: event.name,
        Phase: event.phase,
        Teams: event._count.teams,
        Players: event._count.players,
        Picks: event._count.picks,
        "SHA-256": event.sourceHash?.slice(0, 12) ?? "",
      }))
    );
    console.log("No existing draft, pick, team, board, trade, or user rows were deleted.\n");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nHistorical migration failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

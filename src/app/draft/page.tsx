"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function Stars({ value }: { value: number | null }) {
  const v = value == null ? 0 : clamp(Math.round(value), 0, 5);
  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={value == null ? "No rating" : `${v} out of 5`}
      title={value == null ? "No rating" : `${v} / 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cx("text-base leading-none", i < v ? "text-amber-500" : "text-muted-foreground/40")}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs shadow-sm whitespace-nowrap",
        tone === "good" &&
          "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-100 dark:border-emerald-900/40",
        tone === "warn" &&
          "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900/40",
        tone === "bad" &&
          "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/30 dark:text-rose-100 dark:border-rose-900/40",
        tone === "neutral" && "bg-card text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

type DraftPick = {
  id: string;
  overallNumber: number;
  round: number;
  pickInRound: number;
  madeAt: string;
  team: { id: string; name: string; order: number };
  player: { id: string; fullName: string; rank: number | null };
};

type DraftState = {
  event: {
    id: string;
    name: string;
    scheduledAt: string;
    phase: "SETUP" | "LIVE" | "COMPLETE";
    currentPick: number;
    pickClockSeconds: number;
    isPaused: boolean;
    clockEndsAt: string | null;
    pauseRemainingSecs: number | null;
  } | null;

  teams: {
    id: string;
    name: string;
    order: number;
  }[];

  recentPicks: DraftPick[];
  counts: { undrafted: number; drafted: number };

  me?: { role?: "ADMIN" | "BOARD" | "COACH" | "PARENT" | string };

  myTeam?: { id: string; name: string; order?: number };
};

type RemainingPlayer = {
  id: string;
  fullName: string;
  rating: number | null;
};

type DraftBoardEntry = {
  playerId: string;
  addedAt: number;
};

type SiblingInfo = {
  siblingNames: string;
  draftCost: number | null;
};

const MY_TEAM_ID_KEY = "cys.myTeamId.v1";

function safeReadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function safeWriteJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function snakeTeamIndexFromOverallPick(overallPick1: number, teamCount: number) {
  if (teamCount <= 0) return { round: 1, index: 0, posInRound: 0 };
  const p0 = overallPick1 - 1;
  const round = Math.floor(p0 / teamCount) + 1;
  const posInRound = p0 % teamCount;

  const isReverse = round % 2 === 0;
  const index = isReverse ? teamCount - 1 - posInRound : posInRound;

  return { round, index, posInRound };
}

async function fetchTeamsFallback(): Promise<Array<{ id: string; name: string; order: number }>> {
  try {
    const res = await fetch("/api/admin/teams", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({} as any));
    const teams = (json?.teams ?? json?.items ?? json ?? []) as any[];
    if (!Array.isArray(teams)) return [];

    const normalized = teams
      .map((t) => {
        const id = String(t?.id ?? "");
        const name = String(t?.name ?? t?.teamName ?? "");
        const orderRaw = t?.order ?? t?.draftOrder ?? t?.coachOrder ?? t?.sortOrder ?? null;
        const order = typeof orderRaw === "number" ? orderRaw : Number(orderRaw);
        if (!id || !name) return null;
        return { id, name, order: Number.isFinite(order) ? order : 0 };
      })
      .filter(Boolean) as Array<{ id: string; name: string; order: number }>;

    normalized.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return normalized;
  } catch {
    return [];
  }
}

function toNumberOrNull(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function rankToStars(rank: number | null): number | null {
  if (rank == null) return null;
  if (rank <= 10) return 5;
  if (rank <= 20) return 4;
  if (rank <= 30) return 3;
  if (rank <= 40) return 2;
  return 1;
}

function extractRating(p: any): number | null {
  const candidates = [
    p?.rating,
    p?.boardRating,
    p?.playerRating,
    p?.ratingValue,
    p?.ratingStars,
    p?.stars,
    p?.spring2025Rating,
    p?.fall2025Rating,
    p?.springRating,
    p?.fallRating,
    p?.ratingSpring2025,
    p?.ratingFall2025,
  ];

  for (const c of candidates) {
    const n = toNumberOrNull(c);
    if (n != null) return n;
  }

  const rank =
    toNumberOrNull(p?.rank) ??
    toNumberOrNull(p?.playerRank) ??
    toNumberOrNull(p?.ratingRank) ??
    toNumberOrNull(p?.overallRank) ??
    null;

  const starsFromRank = rankToStars(rank);
  if (starsFromRank != null) return starsFromRank;

  return null;
}

function draftBoardKeyForTeam(teamId: string | null) {
  return `cys.draftBoard.v2.${teamId ?? "unknown"}`;
}

type ServerBoardPayload = {
  entries: DraftBoardEntry[];
};

async function tryFetchBoardFromServer(teamId: string | null): Promise<{ ok: boolean; entries: DraftBoardEntry[] }> {
  try {
    const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const res = await fetch(`/api/draft/board${qs}`, { cache: "no-store" });
    if (res.status === 404) return { ok: false, entries: [] };
    if (!res.ok) return { ok: false, entries: [] };
    const json = (await res.json().catch(() => ({}))) as any;

    const entries = (json?.entries ?? json?.board ?? json ?? []) as any[];
    if (!Array.isArray(entries)) return { ok: true, entries: [] };

    const normalized = entries
      .map((e) => {
        const playerId = String(e?.playerId ?? e?.id ?? "");
        const addedAt = toNumberOrNull(e?.addedAt ?? e?.createdAt ?? Date.now()) ?? Date.now();
        if (!playerId) return null;
        return { playerId, addedAt } as DraftBoardEntry;
      })
      .filter(Boolean) as DraftBoardEntry[];

    return { ok: true, entries: normalized };
  } catch {
    return { ok: false, entries: [] };
  }
}

async function trySaveBoardToServer(teamId: string | null, entries: DraftBoardEntry[]): Promise<boolean> {
  try {
    const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const res = await fetch(`/api/draft/board${qs}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries } satisfies ServerBoardPayload),
    });
    if (res.status === 404) return false;
    return res.ok;
  } catch {
    return false;
  }
}

function parseCost(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.trim()) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 1 || i > 10) return null;
  return i;
}

export default function DraftPage() {
  const fallbackScheduledTarget = useMemo(() => new Date(Date.UTC(2026, 1, 16, 23, 0, 0)), []);

  const [now, setNow] = useState(() => new Date());
  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);

  const [remaining, setRemaining] = useState<RemainingPlayer[]>([]);
  const [q, setQ] = useState("");

  const [allPicks, setAllPicks] = useState<DraftPick[] | null>(null);

  const [draftBoard, setDraftBoard] = useState<DraftBoardEntry[]>([]);
  const [draftErr, setDraftErr] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState<string | null>(null);

  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const explicitTeamIdRef = useRef<string | null>(null);

  const serverBoardSupportedRef = useRef<boolean | null>(null);
  const lastSavedBoardRef = useRef<string>("");

  const [siblingByPlayerId, setSiblingByPlayerId] = useState<Record<string, SiblingInfo>>({});

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const tid = url.searchParams.get("teamId");
      if (tid) {
        explicitTeamIdRef.current = tid;
        setMyTeamId(tid);
        safeWriteJSON(MY_TEAM_ID_KEY, tid);
        return;
      }
    } catch {}

    try {
      const tid = localStorage.getItem(MY_TEAM_ID_KEY);
      if (tid) setMyTeamId(tid);
    } catch {}
  }, []);

  async function loadSiblingInfo() {
    try {
      const res = await fetch("/api/draft/siblings", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({} as any));
      const rows = (json?.rows ?? []) as any[];
      if (!Array.isArray(rows)) return;

      const map: Record<string, SiblingInfo> = {};
      for (const r of rows) {
        const playerId = String(r?.playerId ?? "");
        if (!playerId) continue;
        const siblingNames = String(r?.siblingNames ?? "").trim();
        const draftCost = parseCost(r?.draftCost ?? null);
        map[playerId] = { siblingNames, draftCost };
      }
      setSiblingByPlayerId(map);
    } catch {}
  }

  async function loadDraftBoardForTeam(teamId: string | null) {
    const localKey = draftBoardKeyForTeam(teamId);

    if (serverBoardSupportedRef.current !== false) {
      const server = await tryFetchBoardFromServer(teamId);
      if (server.ok) {
        serverBoardSupportedRef.current = true;
        setDraftBoard(server.entries);
        safeWriteJSON(localKey, server.entries);
        lastSavedBoardRef.current = JSON.stringify(server.entries);
        return;
      }
      if (serverBoardSupportedRef.current == null) serverBoardSupportedRef.current = false;
    }

    const entries = safeReadJSON<DraftBoardEntry[]>(localKey, []);
    const normalized = Array.isArray(entries) ? entries : [];
    setDraftBoard(normalized);
    lastSavedBoardRef.current = JSON.stringify(normalized);
  }

  function setDraftBoardAndPersist(next: DraftBoardEntry[], teamId: string | null) {
    setDraftBoard(next);

    const localKey = draftBoardKeyForTeam(teamId);
    safeWriteJSON(localKey, next);

    const serialized = JSON.stringify(next);
    if (serialized === lastSavedBoardRef.current) return;
    lastSavedBoardRef.current = serialized;

    if (serverBoardSupportedRef.current === true) {
      void trySaveBoardToServer(teamId, next).then((ok) => {
        if (!ok) serverBoardSupportedRef.current = false;
      });
    }
  }

  useEffect(() => {
    void loadDraftBoardForTeam(myTeamId);
  }, [myTeamId]);

  async function loadState() {
    try {
      const res = await fetch("/api/draft/state", { cache: "no-store" });
      const json = (await res.json()) as DraftState;

      let merged = json;

      const teamsMissing = !Array.isArray(json?.teams) || json.teams.length === 0;
      if (teamsMissing) {
        const fallbackTeams = await fetchTeamsFallback();
        if (fallbackTeams.length) merged = { ...json, teams: fallbackTeams };
      }

      setState(merged);

      const role = (merged as any)?.me?.role as string | undefined;
      const autoTeamId = (merged as any)?.myTeam?.id as string | undefined;

      if (!explicitTeamIdRef.current && autoTeamId) {
        setMyTeamId(autoTeamId);
        safeWriteJSON(MY_TEAM_ID_KEY, autoTeamId);
      } else if (!explicitTeamIdRef.current && role === "COACH" && !autoTeamId) {
        setMyTeamId(null);
      }
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllPicksOptional() {
    try {
      const res = await fetch("/api/draft/picks", { cache: "no-store" });
      if (!res.ok) throw new Error("no picks endpoint");
      const json = await res.json().catch(() => ({}));
      const picks = (json.picks ?? []) as DraftPick[];
      if (Array.isArray(picks)) setAllPicks(picks);
    } catch {}
  }

  async function loadRemaining() {
    try {
      const res = await fetch("/api/draft/players?eligible=true&drafted=false&includeRatings=true", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));

      setRemaining(
        (json.players ?? []).map((p: any) => {
          return {
            id: p.id,
            fullName: p.fullName,
            rating: extractRating(p),
          } as RemainingPlayer;
        })
      );
    } catch {
      setRemaining([]);
    }
  }

  useEffect(() => {
    loadState();
    loadRemaining();
    loadAllPicksOptional();
    loadSiblingInfo();

    const poll = setInterval(() => {
      loadState();
      loadRemaining();
      loadAllPicksOptional();
      loadSiblingInfo();
    }, 2000);

    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const remainingIds = new Set(remaining.map((p) => p.id));
    const pruned = draftBoard.filter((e) => remainingIds.has(e.playerId));
    if (pruned.length !== draftBoard.length) {
      setDraftBoardAndPersist(pruned, myTeamId);
    }
  }, [remaining]);

  const event = state?.event ?? null;
  const teams = state?.teams ?? [];
  const teamCount = teams.length;

  const isLive = event?.phase === "LIVE";
  const role = (state as any)?.me?.role as string | undefined;

  const scheduledTarget = useMemo(() => {
    if (event?.scheduledAt) {
      const d = new Date(event.scheduledAt);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return fallbackScheduledTarget;
  }, [event?.scheduledAt, fallbackScheduledTarget]);

  const scheduledDiffMs = Math.max(0, scheduledTarget.getTime() - now.getTime());
  const scheduledTotalSeconds = Math.floor(scheduledDiffMs / 1000);
  const scheduledDays = Math.floor(scheduledTotalSeconds / (60 * 60 * 24));
  const scheduledHours = Math.floor((scheduledTotalSeconds % (60 * 60 * 24)) / (60 * 60));
  const scheduledMinutes = Math.floor((scheduledTotalSeconds % (60 * 60)) / 60);
  const scheduledSeconds = scheduledTotalSeconds % 60;

  const scheduledLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "long",
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(scheduledTarget);
    } catch {
      return "02/16/2026 6:00 PM ET";
    }
  }, [scheduledTarget]);

  const liveClock = useMemo(() => {
    if (!event) return { remaining: null as number | null };
    if (event.isPaused) return { remaining: event.pauseRemainingSecs ?? event.pickClockSeconds };
    if (!event.clockEndsAt) return { remaining: null };
    const endsAt = new Date(event.clockEndsAt);
    const remainingSecs = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 1000));
    return { remaining: remainingSecs };
  }, [event, now]);

  const liveRemaining = liveClock.remaining;
  const liveTotalSeconds = liveRemaining ?? 0;
  const liveMin = Math.floor(liveTotalSeconds / 60);
  const liveSec = liveTotalSeconds % 60;

  const picksForBoard = useMemo(() => {
    const src = (allPicks && allPicks.length ? allPicks : state?.recentPicks ?? []).slice();
    return src;
  }, [allPicks, state?.recentPicks]);

  const lastPick = useMemo(() => {
    const src = picksForBoard.length ? picksForBoard : state?.recentPicks ?? [];
    if (!src.length) return null;
    return (
      src
        .slice()
        .sort((a, b) => (a.overallNumber ?? 0) - (b.overallNumber ?? 0))
        .at(-1) ?? null
    );
  }, [picksForBoard, state?.recentPicks]);

  const onClockTeam = useMemo(() => {
    const cur = event?.currentPick ?? 1;
    if (!teamCount) return null;
    const { index } = snakeTeamIndexFromOverallPick(cur, teamCount);
    return teams[index] ?? null;
  }, [event?.currentPick, teamCount, teams]);

  const onDeckTeam = useMemo(() => {
    const cur = (event?.currentPick ?? 1) + 1;
    if (!teamCount) return null;
    const { index } = snakeTeamIndexFromOverallPick(cur, teamCount);
    return teams[index] ?? null;
  }, [event?.currentPick, teamCount, teams]);

  const isMyTurn = useMemo(() => {
    if (!isLive) return false;
    if (!myTeamId) return false;
    return onClockTeam?.id === myTeamId && !event?.isPaused;
  }, [isLive, myTeamId, onClockTeam?.id, event?.isPaused]);

  const filteredRemaining = useMemo(() => {
    const s = q.trim().toLowerCase();

    const list = s ? remaining.filter((p) => (p.fullName ?? "").toLowerCase().includes(s)) : remaining;

    return [...list].sort((a, b) => {
      const ra = a.rating;
      const rb = b.rating;
      if (ra == null && rb == null) return a.fullName.localeCompare(b.fullName);
      if (ra == null) return 1;
      if (rb == null) return -1;

      if (rb !== ra) return rb - ra;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [remaining, q]);

  const remainingById = useMemo(() => {
    const map = new Map<string, RemainingPlayer>();
    for (const p of remaining) map.set(p.id, p);
    return map;
  }, [remaining]);

  const draftBoardPlayers = useMemo(() => {
    return draftBoard
      .slice()
      .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0))
      .map((e) => remainingById.get(e.playerId))
      .filter(Boolean) as RemainingPlayer[];
  }, [draftBoard, remainingById]);

  const myRoster = useMemo(() => {
    if (!myTeamId) return [] as DraftPick[];
    const src = picksForBoard.length ? picksForBoard : state?.recentPicks ?? [];
    return src
      .filter((p) => p.team?.id === myTeamId)
      .slice()
      .sort((a, b) => (a.overallNumber ?? 0) - (b.overallNumber ?? 0));
  }, [myTeamId, picksForBoard, state?.recentPicks]);

  function isOnDraftBoard(playerId: string) {
    return draftBoard.some((e) => e.playerId === playerId);
  }

  function addToDraftBoard(playerId: string) {
    if (isOnDraftBoard(playerId)) return;
    const next = [...draftBoard, { playerId, addedAt: Date.now() }];
    setDraftBoardAndPersist(next, myTeamId);
  }

  function removeFromDraftBoard(playerId: string) {
    const next = draftBoard.filter((e) => e.playerId !== playerId);
    setDraftBoardAndPersist(next, myTeamId);
  }

  function clearDraftBoard() {
    setDraftBoardAndPersist([], myTeamId);
  }

  async function coachDraftPlayer(playerId: string) {
    setDraftErr(null);
    setDraftBusy(playerId);

    try {
      const res = await fetch("/api/draft/pick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId }),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          j?.error ?? (res.status === 404 ? "Missing endpoint: POST /api/draft/pick" : "Failed to draft player");
        throw new Error(msg);
      }

      const siblingId: string | null =
        (j?.siblingAutoPick?.player?.id as string | undefined) ??
        (j?.siblingAutoPick?.playerId as string | undefined) ??
        null;

      const nextBoard = draftBoard.filter((e) => e.playerId !== playerId && (!siblingId || e.playerId !== siblingId));
      if (nextBoard.length !== draftBoard.length) {
        setDraftBoardAndPersist(nextBoard, myTeamId);
      }

      await loadState();
      await loadAllPicksOptional();
      await loadRemaining();
    } catch (e: any) {
      setDraftErr(e?.message ?? "Failed to draft player");
    } finally {
      setDraftBusy(null);
    }
  }

  const teamHint = !myTeamId
    ? role === "COACH"
      ? "No team assigned to this coach yet"
      : "Tip: add ?teamId=YOUR_TEAM_ID"
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-lg font-semibold">Loading…</div>
        <div className="mt-2 text-sm text-muted-foreground">Connecting to draft state</div>
      </div>
    );
  }

  return (
    <div className="py-4 space-y-4">
      <div
        className={cx(
          "rounded-3xl border p-4 shadow-sm",
          isLive
            ? event?.isPaused
              ? "bg-amber-50/60 dark:bg-amber-950/20"
              : "bg-emerald-50/60 dark:bg-emerald-950/20"
            : "bg-card"
        )}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">{isLive ? "Draft Room" : "Draft Countdown"}</h1>
              <Pill tone="neutral">Status: {event?.phase ?? "SETUP"}</Pill>
              {isLive ? (event?.isPaused ? <Pill tone="warn">⏸ Paused</Pill> : <Pill tone="good">● Live</Pill>) : null}
              {teamHint ? <Pill tone="warn">{teamHint}</Pill> : null}
              {isLive && teamCount === 0 ? <Pill tone="bad">No teams loaded</Pill> : null}
              {isLive && isMyTurn ? <Pill tone="good">It’s your turn</Pill> : null}
            </div>

            <div className="mt-1 text-sm text-muted-foreground">
              {event?.name ?? "CYS Draft"} · Remaining: {state?.counts?.undrafted ?? remaining.length} · Drafted:{" "}
              {state?.counts?.drafted ?? 0}
            </div>

            {!isLive ? (
              <div className="mt-1 text-xs text-muted-foreground">
                Scheduled: <span className="font-semibold">{scheduledLabel}</span>
              </div>
            ) : null}
          </div>

          {!isLive ? (
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border bg-background px-4 py-3 shadow-sm">
                <div className="text-[11px] text-muted-foreground">Days</div>
                <div className="text-xl font-bold tabular-nums">{scheduledDays}</div>
              </div>
              <div className="rounded-2xl border bg-background px-4 py-3 shadow-sm">
                <div className="text-[11px] text-muted-foreground">Time</div>
                <div className="text-xl font-bold tabular-nums">
                  {pad2(scheduledHours)}:{pad2(scheduledMinutes)}:{pad2(scheduledSeconds)}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border bg-background px-4 py-3 shadow-sm">
                <div className="text-[11px] text-muted-foreground">Current Pick</div>
                <div className="text-lg font-semibold tabular-nums">#{event?.currentPick ?? 1}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {onClockTeam?.name ?? (teamCount ? "—" : "No teams")}
                </div>
              </div>

              <div className="rounded-2xl border bg-background px-4 py-3 shadow-sm">
                <div className="text-[11px] text-muted-foreground">On Deck</div>
                <div className="text-lg font-semibold truncate">{onDeckTeam?.name ?? (teamCount ? "—" : "—")}</div>
                <div className="text-xs text-muted-foreground">Next up</div>
              </div>

              <div className="rounded-2xl border bg-background px-4 py-3 shadow-sm">
                <div className="text-[11px] text-muted-foreground">Timer</div>
                <div className="text-lg font-bold tabular-nums">
                  {pad2(liveMin)}:{pad2(liveSec)}
                </div>
                <div className="text-xs text-muted-foreground">{event?.isPaused ? "Paused" : "Time left"}</div>
              </div>

              <div className="rounded-2xl border bg-background px-4 py-3 shadow-sm">
                <div className="text-[11px] text-muted-foreground">Last Pick</div>
                <div className="text-sm font-semibold truncate">{lastPick?.player.fullName ?? "—"}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground truncate">{lastPick?.team?.name ?? "—"}</span>
                  <Stars value={rankToStars(lastPick?.player?.rank ?? null)} />
                </div>
              </div>
            </div>
          )}
        </div>

        {draftErr ? <div className="mt-3 text-sm text-rose-600">{draftErr}</div> : null}
      </div>

      <div className="rounded-3xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">My Roster</div>
            <div className="text-xs text-muted-foreground">
              Populates automatically from picks for your team{!myTeamId ? " (missing teamId)" : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone="neutral">{myRoster.length} players</Pill>
          </div>
        </div>

        {!myTeamId ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Add <span className="font-semibold">?teamId=</span> to the URL (or set{" "}
            <span className="font-semibold">{MY_TEAM_ID_KEY}</span> in localStorage) to enable roster.
          </div>
        ) : myRoster.length === 0 ? (
          <div className="mt-3 text-sm text-muted-foreground">No picks yet.</div>
        ) : (
          <div className="mt-3 rounded-2xl border overflow-hidden">
            <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-semibold">
              <div className="col-span-7">Player</div>
              <div className="col-span-3">Rating</div>
              <div className="col-span-2 text-right">Pick</div>
            </div>
            <div className="divide-y">
              {myRoster.map((p) => (
                <div key={p.id} className="grid grid-cols-12 px-3 py-2 text-sm">
                  <div className="col-span-7 font-semibold truncate">{p.player.fullName}</div>
                  <div className="col-span-3 flex items-center">
                    <Stars value={rankToStars(p.player.rank)} />
                  </div>
                  <div className="col-span-2 text-right text-xs text-muted-foreground tabular-nums">
                    #{p.overallNumber}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8">
          <div className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Eligible Players</div>
                <div className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold">{filteredRemaining.length}</span> of{" "}
                  <span className="font-semibold">{remaining.length}</span>
                  {isLive ? " · Drafting enabled when it’s your turn" : " · Build your draft board now"}
                </div>
              </div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="h-9 w-52 rounded-md border px-3 text-sm"
              />
            </div>

            <div className="mt-3 rounded-2xl border overflow-hidden">
              <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold sticky top-0">
                <div className="col-span-6">Player</div>
                <div className="col-span-3">Rating</div>
                <div className="col-span-3 text-right">Actions</div>
              </div>

              {filteredRemaining.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground">No matches.</div>
              ) : (
                <div className="divide-y max-h-[70vh] overflow-auto">
                  {filteredRemaining.map((p) => {
                    const onBoard = isOnDraftBoard(p.id);
                    const canDraft = isLive && isMyTurn && !draftBusy && teamCount > 0;
                    const sib = siblingByPlayerId[p.id] ?? null;

                    return (
                      <div key={p.id} className="grid grid-cols-12 gap-0 px-3 py-2 text-sm hover:bg-muted/40 transition">
                        <div className="col-span-6 min-w-0">
                          <div className="font-semibold truncate">{p.fullName}</div>
                          {sib?.siblingNames ? (
                            <div className="mt-0.5 text-xs text-muted-foreground truncate">
                              Sibling: <span className="font-semibold">{sib.siblingNames}</span>
                              {sib.draftCost != null ? (
                                <span className="ml-2">
                                  <span className="font-semibold">Cost</span>: {sib.draftCost}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <div className="col-span-3 flex items-center">
                          <Stars value={p.rating} />
                        </div>

                        <div className="col-span-3 flex items-center justify-end gap-2">
                          {!onBoard ? (
                            <button onClick={() => addToDraftBoard(p.id)} className="h-8 rounded-md border px-2 text-xs hover:bg-muted">
                              Add to Draft Board
                            </button>
                          ) : (
                            <button onClick={() => removeFromDraftBoard(p.id)} className="h-8 rounded-md border px-2 text-xs hover:bg-muted">
                              Remove
                            </button>
                          )}

                          <button
                            disabled={!canDraft || draftBusy === p.id}
                            onClick={() => coachDraftPlayer(p.id)}
                            className={cx(
                              "h-8 rounded-md px-3 text-xs border",
                              canDraft ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700" : "bg-muted text-muted-foreground"
                            )}
                            title={
                              teamCount === 0
                                ? "No teams loaded"
                                : !isLive
                                ? "Draft is not live yet"
                                : !myTeamId
                                ? "Missing teamId"
                                : !isMyTurn
                                ? "Not your turn"
                                : event?.isPaused
                                ? "Draft is paused"
                                : "Draft player"
                            }
                          >
                            {draftBusy === p.id ? "Drafting…" : "Draft"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-muted-foreground"></div>
          </div>
        </div>

        <div className="xl:col-span-4">
          <div className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">My Draft Board</div>
                <div className="text-xs text-muted-foreground">
                  {serverBoardSupportedRef.current === true ? "Saved to backend" : "Saved locally (backend endpoint missing)"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone="neutral">{draftBoardPlayers.length}</Pill>
                <button onClick={clearDraftBoard} className="h-8 rounded-md border px-2 text-xs hover:bg-muted">
                  Clear
                </button>
              </div>
            </div>

            {draftBoardPlayers.length === 0 ? (
              <div className="mt-4 text-sm text-muted-foreground">Add players from the Eligible list to build your board.</div>
            ) : (
              <div className="mt-3 rounded-2xl border overflow-hidden">
                <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-semibold">
                  <div className="col-span-5">Player</div>
                  <div className="col-span-4">Sibling</div>
                  <div className="col-span-1">Cost</div>
                  <div className="col-span-1">★</div>
                  <div className="col-span-1 text-right">Actions</div>
                </div>

                <div className="divide-y max-h-[70vh] overflow-auto">
                  {draftBoardPlayers.map((p) => {
                    const canDraft = isLive && isMyTurn && !draftBusy && teamCount > 0;
                    const sib = siblingByPlayerId[p.id] ?? null;

                    return (
                      <div key={p.id} className="grid grid-cols-12 px-3 py-2 text-sm hover:bg-muted/40 transition">
                        <div className="col-span-5 font-semibold truncate">{p.fullName}</div>

                        <div className="col-span-4 text-xs text-muted-foreground truncate">
                          {sib?.siblingNames ? sib.siblingNames : "—"}
                        </div>

                        <div className="col-span-1 text-xs tabular-nums">
                          {sib?.draftCost != null ? sib.draftCost : "—"}
                        </div>

                        <div className="col-span-1 flex items-center">
                          <Stars value={p.rating} />
                        </div>

                        <div className="col-span-1 flex justify-end gap-2">
                          <button onClick={() => removeFromDraftBoard(p.id)} className="h-8 rounded-md border px-2 text-xs hover:bg-muted">
                            ✕
                          </button>
                          <button
                            disabled={!canDraft || draftBusy === p.id}
                            onClick={() => coachDraftPlayer(p.id)}
                            className={cx(
                              "h-8 rounded-md px-2 text-xs border",
                              canDraft ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700" : "bg-muted text-muted-foreground"
                            )}
                            title={
                              teamCount === 0
                                ? "No teams loaded"
                                : !isLive
                                ? "Draft is not live yet"
                                : !myTeamId
                                ? "Missing teamId"
                                : !isMyTurn
                                ? "Not your turn"
                                : event?.isPaused
                                ? "Draft is paused"
                                : "Draft player"
                            }
                          >
                            {draftBusy === p.id ? "…" : "Draft"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-3 text-xs text-muted-foreground"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

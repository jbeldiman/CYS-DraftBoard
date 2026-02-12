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

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-xl border bg-background p-1 shadow-sm">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              "px-3 py-1.5 text-xs rounded-lg transition",
              active ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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
  slot?: number; 
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
  return `cys.draftBoard.v3.${teamId ?? "unknown"}`;
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
        const slot = toNumberOrNull(e?.slot) ?? undefined;
        if (!playerId) return null;
        return { playerId, addedAt, slot } as DraftBoardEntry;
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

async function adminPlacePick(overallNumber: number, playerId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    let res = await fetch("/api/draft/admin/pick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overallNumber, playerId }),
    });

    if (!res.ok) {
      res = await fetch("/api/draft/admin/pick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pickNumber: overallNumber, playerId }),
      });
    }

    if (!res.ok) {
      const j = await res.json().catch(() => ({} as any));
      return { ok: false, error: j?.error ?? "Admin pick failed" };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Admin pick failed" };
  }
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

  const [isCompact, setIsCompact] = useState(false);
  const [mobileTab, setMobileTab] = useState<"eligible" | "board" | "roster">("eligible");

  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [slotPickerSlot, setSlotPickerSlot] = useState<number | null>(null);
  const [slotPickerQ, setSlotPickerQ] = useState("");

  const [adminPickNumber, setAdminPickNumber] = useState<number>(1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsCompact(mq.matches);
    apply();
    const anyMq = mq as any;
    if (anyMq.addEventListener) anyMq.addEventListener("change", apply);
    else anyMq.addListener?.(apply);
    return () => {
      if (anyMq.removeEventListener) anyMq.removeEventListener("change", apply);
      else anyMq.removeListener?.(apply);
    };
  }, []);

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

  async function loadDraftBoardForTeam(teamId: string | null) {
    const localKey = draftBoardKeyForTeam(teamId);

    const normalizeLegacy = (entries: DraftBoardEntry[]) => {
      const hasSlots = entries.some((e) => typeof e.slot === "number" && Number.isFinite(e.slot as any));
      if (hasSlots) return entries;

    
      const sorted = entries
        .slice()
        .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0))
        .map((e, idx) => ({ ...e, slot: idx + 1 }));
      return sorted;
    };

    if (serverBoardSupportedRef.current !== false) {
      const server = await tryFetchBoardFromServer(teamId);
      if (server.ok) {
        serverBoardSupportedRef.current = true;
        const normalized = normalizeLegacy(server.entries);
        setDraftBoard(normalized);
        safeWriteJSON(localKey, normalized);
        lastSavedBoardRef.current = JSON.stringify(normalized);
        return;
      }
      if (serverBoardSupportedRef.current == null) serverBoardSupportedRef.current = false;
    }

    const entries = safeReadJSON<DraftBoardEntry[]>(localKey, []);
    const normalized = normalizeLegacy(Array.isArray(entries) ? entries : []);
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

    const poll = setInterval(() => {
      loadState();
      loadRemaining();
      loadAllPicksOptional();
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
    if (pruned.length !== draftBoard.length) setDraftBoardAndPersist(pruned, myTeamId);
  }, [remaining]);

  const event = state?.event ?? null;
  const teams = state?.teams ?? [];
  const teamCount = teams.length;

  const isLive = event?.phase === "LIVE";
  const role = (state as any)?.me?.role as string | undefined;
  const isAdmin = role === "ADMIN" || role === "BOARD";

  useEffect(() => {
    const cur = event?.currentPick ?? 1;
    if (Number.isFinite(cur)) setAdminPickNumber(cur);
  }, [event?.currentPick]);

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

  const myRoster = useMemo(() => {
    if (!myTeamId) return [] as DraftPick[];
    const src = picksForBoard.length ? picksForBoard : state?.recentPicks ?? [];
    return src
      .filter((p) => p.team?.id === myTeamId)
      .slice()
      .sort((a, b) => (a.overallNumber ?? 0) - (b.overallNumber ?? 0));
  }, [myTeamId, picksForBoard, state?.recentPicks]);

  const draftedCount = state?.counts?.drafted ?? picksForBoard.length ?? 0;
  const undraftedCount = state?.counts?.undrafted ?? remaining.length ?? 0;
  const totalPlayers = Math.max(0, draftedCount + undraftedCount);
  const rounds = teamCount > 0 ? Math.max(1, Math.ceil(totalPlayers / teamCount)) : 0;

  const boardBySlot = useMemo(() => {
    const m = new Map<number, DraftBoardEntry>();
    for (const e of draftBoard) {
      const s = typeof e.slot === "number" && Number.isFinite(e.slot) ? e.slot : null;
      if (s && s > 0) m.set(s, e);
    }
    return m;
  }, [draftBoard]);

  const usedPlayerIds = useMemo(() => new Set(draftBoard.map((e) => e.playerId)), [draftBoard]);

  function removeFromDraftBoard(playerId: string) {
    const next = draftBoard.filter((e) => e.playerId !== playerId);
    setDraftBoardAndPersist(next, myTeamId);
  }

  function clearDraftBoard() {
    setDraftBoardAndPersist([], myTeamId);
  }

  function setSlotPlayer(slot: number, playerId: string) {
    const next = draftBoard.filter((e) => e.slot !== slot && e.playerId !== playerId);
    next.push({ playerId, addedAt: Date.now(), slot });
    setDraftBoardAndPersist(
      next.slice().sort((a, b) => (a.slot ?? 999999) - (b.slot ?? 999999) || (a.addedAt ?? 0) - (b.addedAt ?? 0)),
      myTeamId
    );
  }

  function clearSlot(slot: number) {
    const next = draftBoard.filter((e) => e.slot !== slot);
    setDraftBoardAndPersist(next, myTeamId);
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

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg =
          j?.error ?? (res.status === 404 ? "Missing endpoint: POST /api/draft/pick" : "Failed to draft player");
        throw new Error(msg);
      }

      await loadState();
      await loadAllPicksOptional();
      await loadRemaining();
      removeFromDraftBoard(playerId);
    } catch (e: any) {
      setDraftErr(e?.message ?? "Failed to draft player");
    } finally {
      setDraftBusy(null);
    }
  }

  async function adminForcePick(playerId: string, pickNum: number) {
    setDraftErr(null);
    setDraftBusy(playerId);
    try {
      const r = await adminPlacePick(pickNum, playerId);
      if (!r.ok) throw new Error(r.error ?? "Admin pick failed");
      await loadState();
      await loadAllPicksOptional();
      await loadRemaining();
      removeFromDraftBoard(playerId);
    } catch (e: any) {
      setDraftErr(e?.message ?? "Admin pick failed");
    } finally {
      setDraftBusy(null);
    }
  }

  const teamHint =
    !myTeamId ? (role === "COACH" ? "No team assigned to this coach yet" : "Tip: add ?teamId=YOUR_TEAM_ID") : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-lg font-semibold">Loading…</div>
        <div className="mt-2 text-sm text-muted-foreground">Connecting to draft state</div>
      </div>
    );
  }

  const canDraftAny = isLive && isMyTurn && !draftBusy && teamCount > 0;
  const slotPickerList = useMemo(() => {
    const s = slotPickerQ.trim().toLowerCase();
    const base = s
      ? remaining.filter((p) => (p.fullName ?? "").toLowerCase().includes(s))
      : remaining.slice();
    return base
      .filter((p) => !usedPlayerIds.has(p.id))
      .sort((a, b) => {
        const ra = a.rating;
        const rb = b.rating;
        if (ra == null && rb == null) return a.fullName.localeCompare(b.fullName);
        if (ra == null) return 1;
        if (rb == null) return -1;
        if (rb !== ra) return rb - ra;
        return a.fullName.localeCompare(b.fullName);
      })
      .slice(0, 200);
  }, [remaining, slotPickerQ, usedPlayerIds]);

  return (
    <div className="py-3 sm:py-4 space-y-4">
      {/* Header */}
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
              {teamCount > 0 ? <Pill tone="neutral">Rounds: {rounds}</Pill> : null}
            </div>

            <div className="mt-1 text-sm text-muted-foreground">
              {event?.name ?? "CYS Draft"} · Remaining: {undraftedCount} · Drafted: {draftedCount}
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
                <div className="text-lg font-semibold truncate">{onDeckTeam?.name ?? (teamCount ? "—" : "No teams")}</div>
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

        {/* Mobile tabs */}
        {isCompact ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <Segmented
              value={mobileTab}
              onChange={(v) => setMobileTab(v as any)}
              options={[
                { value: "eligible", label: "Eligible" },
                { value: "board", label: "My Board" },
                { value: "roster", label: "Roster" },
              ]}
            />
            {isLive ? <Pill tone={canDraftAny ? "good" : "neutral"}>{canDraftAny ? "Drafting on" : "Drafting off"}</Pill> : null}
          </div>
        ) : null}

        {/* Admin quick-pick bar */}
        {isAdmin ? (
          <div className="mt-4 rounded-2xl border bg-background p-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-sm font-semibold">Admin Controls</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Force pick #</span>
                <input
                  value={String(adminPickNumber)}
                  onChange={(e) => setAdminPickNumber(Math.max(1, Number(e.target.value || 1)))}
                  className="h-9 w-24 rounded-md border px-3 text-sm tabular-nums"
                  inputMode="numeric"
                />
                <Pill tone="neutral">Use “Place” buttons</Pill>
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              This lets you assign a player to any overall pick (e.g. guarantee your son at pick 3).
            </div>
          </div>
        ) : null}
      </div>

      {/* Roster */}
      <div className={cx(isCompact && mobileTab !== "roster" ? "hidden" : "block")}>
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
                    <div className="col-span-2 text-right text-xs text-muted-foreground tabular-nums">#{p.overallNumber}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main */}
      <div className={cx("grid grid-cols-1 xl:grid-cols-12 gap-4", isCompact ? "xl:grid-cols-1" : "")}>
        {/* Eligible */}
        <div className={cx("xl:col-span-8", isCompact && mobileTab !== "eligible" ? "hidden" : "block")}>
          <div className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
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
                className={cx("h-9 rounded-md border px-3 text-sm", isCompact ? "w-36" : "w-52")}
              />
            </div>

            <div className="mt-3 rounded-2xl border overflow-hidden">
              <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold sticky top-0">
                <div className="col-span-7 sm:col-span-6">Player</div>
                <div className="hidden sm:block sm:col-span-3">Rating</div>
                <div className="col-span-5 sm:col-span-3 text-right">Actions</div>
              </div>

              {filteredRemaining.length === 0 ? (
                <div className="px-3 py-8 text-sm text-muted-foreground">No matches.</div>
              ) : (
                <div className={cx("divide-y overflow-auto", isCompact ? "max-h-[72vh]" : "max-h-[70vh]")}>
                  {filteredRemaining.map((p) => {
                    const canDraft = isLive && isMyTurn && !draftBusy && teamCount > 0;
                    const onLocalBoard = draftBoard.some((e) => e.playerId === p.id);

                    return (
                      <div
                        key={p.id}
                        className={cx(
                          "grid grid-cols-12 gap-0 px-3 py-2 text-sm hover:bg-muted/40 transition",
                          isCompact && "py-3"
                        )}
                      >
                        <div className="col-span-7 sm:col-span-6 min-w-0">
                          <div className="font-semibold truncate">{p.fullName}</div>
                          {isCompact ? (
                            <div className="mt-1 text-xs text-muted-foreground flex items-center justify-between">
                              <Stars value={p.rating} />
                              {onLocalBoard ? <span className="text-[11px]">On board</span> : <span className="text-[11px]">—</span>}
                            </div>
                          ) : null}
                        </div>

                        <div className="hidden sm:flex sm:col-span-3 items-center">
                          <Stars value={p.rating} />
                        </div>

                        <div className="col-span-5 sm:col-span-3 flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              
                              const emptySlot =
                                rounds > 0
                                  ? Array.from({ length: rounds }).findIndex((_, i) => !boardBySlot.has(i + 1)) + 1
                                  : 0;
                              if (emptySlot > 0) setSlotPlayer(emptySlot, p.id);
                              else setDraftErr("Cannot add to board yet (teams not synced / rounds unknown).");
                            }}
                            className={cx("h-9 sm:h-8 rounded-md border px-2 text-xs hover:bg-muted", isCompact && "px-3")}
                          >
                            Add
                          </button>

                          {isAdmin ? (
                            <button
                              disabled={!!draftBusy}
                              onClick={() => adminForcePick(p.id, adminPickNumber)}
                              className={cx(
                                "h-9 sm:h-8 rounded-md px-3 text-xs border",
                                "bg-amber-600 text-white border-amber-700 hover:bg-amber-700"
                              )}
                            >
                              Place
                            </button>
                          ) : (
                            <button
                              disabled={!canDraft || draftBusy === p.id}
                              onClick={() => coachDraftPlayer(p.id)}
                              className={cx(
                                "h-9 sm:h-8 rounded-md px-3 text-xs border",
                                canDraft
                                  ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
                                  : "bg-muted text-muted-foreground"
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
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* My Draft Board */}
        <div className={cx("xl:col-span-4", isCompact && mobileTab !== "board" ? "hidden" : "block")}>
          <div className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">My Draft Board</div>
                <div className="text-xs text-muted-foreground">
                  {teamCount > 0 ? `Auto-populated: ${rounds} rounds` : "Waiting for teams to sync"}
                  {" · "}
                  {serverBoardSupportedRef.current === true ? "Saved to backend" : "Saved locally"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone="neutral">{draftBoard.length}</Pill>
                <button onClick={clearDraftBoard} className="h-9 sm:h-8 rounded-md border px-3 sm:px-2 text-xs hover:bg-muted">
                  Clear
                </button>
              </div>
            </div>

            {teamCount === 0 ? (
              <div className="mt-4 text-sm text-muted-foreground">Teams haven’t synced yet — board slots will appear once they do.</div>
            ) : (
              <div className="mt-3 rounded-2xl border overflow-hidden">
                <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-semibold">
                  <div className="col-span-2">Rnd</div>
                  <div className="col-span-7">Player</div>
                  <div className="col-span-3 text-right">Actions</div>
                </div>

                <div className={cx("divide-y overflow-auto", isCompact ? "max-h-[72vh]" : "max-h-[70vh]")}>
                  {Array.from({ length: rounds }).map((_, i) => {
                    const slot = i + 1;
                    const entry = boardBySlot.get(slot) ?? null;
                    const player = entry ? remainingById.get(entry.playerId) ?? null : null;
                    const canDraft = isLive && isMyTurn && !draftBusy && teamCount > 0 && !!player;

                    return (
                      <div
                        key={slot}
                        className={cx("grid grid-cols-12 px-3 py-2 text-sm hover:bg-muted/40 transition", isCompact && "py-3")}
                      >
                        <div className="col-span-2 text-xs text-muted-foreground tabular-nums">R{slot}</div>

                        <div className="col-span-7 min-w-0">
                          {player ? (
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-semibold truncate">{player.fullName}</div>
                              <div className="hidden sm:flex">
                                <Stars value={player.rating} />
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground italic">Empty slot</div>
                          )}
                        </div>

                        <div className="col-span-3 flex justify-end gap-2">
                          {player ? (
                            <>
                              <button
                                onClick={() => clearSlot(slot)}
                                className="h-9 sm:h-8 rounded-md border px-3 sm:px-2 text-xs hover:bg-muted"
                              >
                                ✕
                              </button>

                              <button
                                disabled={!canDraft || draftBusy === player.id}
                                onClick={() => coachDraftPlayer(player.id)}
                                className={cx(
                                  "h-9 sm:h-8 rounded-md px-3 sm:px-2 text-xs border",
                                  canDraft
                                    ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
                                    : "bg-muted text-muted-foreground"
                                )}
                                title={
                                  !isLive
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
                                {draftBusy === player.id ? "…" : "Draft"}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setSlotPickerSlot(slot);
                                setSlotPickerQ("");
                                setSlotPickerOpen(true);
                              }}
                              className="h-9 sm:h-8 rounded-md border px-3 sm:px-2 text-xs hover:bg-muted"
                            >
                              Pick
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isAdmin ? (
              <div className="mt-3 text-xs text-muted-foreground">
                Admin tip: you can also “Place” from the Eligible list to force any overall pick.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Slot picker modal */}
      {slotPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-3xl border bg-background shadow-xl">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Select player for Round {slotPickerSlot ?? "?"}</div>
                  <div className="text-xs text-muted-foreground">Only eligible/undrafted players are shown.</div>
                </div>
                <button
                  onClick={() => setSlotPickerOpen(false)}
                  className="h-9 rounded-md border px-3 text-xs hover:bg-muted"
                >
                  Close
                </button>
              </div>
              <input
                value={slotPickerQ}
                onChange={(e) => setSlotPickerQ(e.target.value)}
                placeholder="Search player…"
                className="mt-3 h-9 w-full rounded-md border px-3 text-sm"
              />
            </div>

            <div className="max-h-[60vh] overflow-auto divide-y">
              {slotPickerList.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No matches.</div>
              ) : (
                slotPickerList.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const slot = slotPickerSlot;
                      if (!slot) return;
                      setSlotPlayer(slot, p.id);
                      setSlotPickerOpen(false);
                    }}
                    className="w-full text-left p-3 hover:bg-muted/50 transition flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{p.fullName}</div>
                      <div className="text-xs text-muted-foreground">Click to assign to Round {slotPickerSlot}</div>
                    </div>
                    <Stars value={p.rating} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

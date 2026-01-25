"use client";

import React, { useEffect, useMemo, useState } from "react";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
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

type Team = { id: string; name: string; order: number };

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
  teams: Team[];
  recentPicks: DraftPick[];
  counts: { undrafted: number; drafted: number };
};

type RemainingPlayer = {
  id: string;
  fullName: string;
  rating: number | null; 
};


const FALLBACK_TEAMS_ENDPOINT = "/api/admin/teams";

const OPTIONAL_ALL_PICKS_ENDPOINT = "/api/draft/picks";

const DEFAULT_ROUNDS = 16;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function Stars({ value }: { value: number | null }) {
  const v = value == null ? 0 : clamp(Math.round(value), 0, 5);
  return (
    <div className="flex items-center gap-0.5" aria-label={value == null ? "No rating" : `${v} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={cx("text-base leading-none", i < v ? "text-amber-500" : "text-muted-foreground/40")}>
          ★
        </span>
      ))}
    </div>
  );
}

function snakeTeamIndexFromOverallPick(overallPick1: number, teamCount: number) {
  if (teamCount <= 0) return { round: 1, index: 0 };
  const p0 = overallPick1 - 1;
  const round = Math.floor(p0 / teamCount) + 1;
  const posInRound = p0 % teamCount;

  const isReverse = round % 2 === 0; 
  const index = isReverse ? teamCount - 1 - posInRound : posInRound;

  return { round, index, posInRound };
}

function snakePickInRound(overallPick1: number, teamCount: number) {
  if (teamCount <= 0) return 1;
  const p0 = overallPick1 - 1;
  return (p0 % teamCount) + 1;
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border bg-background shadow-xl">
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-md border px-2 py-1 text-sm hover:bg-muted">
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function LiveDraftPage() {
  const fallbackScheduledTarget = useMemo(() => new Date(Date.UTC(2026, 1, 16, 23, 0, 0)), []);
  const [now, setNow] = useState(() => new Date());

  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);

  const [teams, setTeams] = useState<Team[]>([]);
  const [remaining, setRemaining] = useState<RemainingPlayer[]>([]);
  const [q, setQ] = useState("");

  const [allPicks, setAllPicks] = useState<DraftPick[] | null>(null);

  const [draftOpen, setDraftOpen] = useState(false);
  const [draftRound, setDraftRound] = useState<number>(1);
  const [draftTeam, setDraftTeam] = useState<Team | null>(null);
  const [draftPickInRound, setDraftPickInRound] = useState<number>(1);
  const [draftOverall, setDraftOverall] = useState<number | null>(null);

  const [pickSearch, setPickSearch] = useState("");
  const [pickBusy, setPickBusy] = useState(false);
  const [pickErr, setPickErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function loadState() {
    try {
      const res = await fetch("/api/draft/state", { cache: "no-store" });
      const json = (await res.json()) as DraftState;
      setState(json);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadTeamsFallbackIfNeeded(nextState?: DraftState | null) {
    const st = nextState ?? state;
    const stTeams = st?.teams ?? [];

    if (stTeams.length) {
      setTeams(stTeams.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      return;
    }

    try {
      const res = await fetch(FALLBACK_TEAMS_ENDPOINT, { cache: "no-store" });
      if (!res.ok) throw new Error("no teams");
      const json = await res.json().catch(() => ({}));
      const t = (json.teams ?? json ?? []) as any[];
      const mapped: Team[] = (Array.isArray(t) ? t : []).map((x: any, i: number) => ({
        id: x.id,
        name: x.name ?? x.teamName ?? `Team ${i + 1}`,
        order: x.order ?? x.pickOrder ?? i + 1,
      }));
      setTeams(mapped.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    } catch {
      setTeams([]);
    }
  }

  async function loadAllPicksOptional() {
    try {
      const res = await fetch(OPTIONAL_ALL_PICKS_ENDPOINT, { cache: "no-store" });
      if (!res.ok) throw new Error("no picks endpoint");
      const json = await res.json().catch(() => ({}));
      const picks = (json.picks ?? []) as DraftPick[];
      if (Array.isArray(picks) && picks.length) setAllPicks(picks);
    } catch {
    }
  }

  async function loadRemaining() {
    try {
      const res = await fetch("/api/draft/players?eligible=true&drafted=false", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));

      setRemaining(
        (json.players ?? []).map((p: any) => {
          const rawRating = p.rating ?? p.boardRating ?? p.playerRating ?? null;
          const rank = p.rank ?? p.playerRank ?? null;

          const ratingFromRank =
            rank == null ? null : rank <= 10 ? 5 : rank <= 20 ? 4 : rank <= 30 ? 3 : rank <= 40 ? 2 : 1;

          return { id: p.id, fullName: p.fullName, rating: rawRating ?? ratingFromRank } as RemainingPlayer;
        })
      );
    } catch {
      setRemaining([]);
    }
  }

  useEffect(() => {
    (async () => {
      await loadState();
    })();
    loadRemaining();
    loadAllPicksOptional();

    const t = setInterval(() => {
      loadState();
      loadRemaining();
      loadAllPicksOptional();
    }, 2000);

    return () => clearInterval(t);
  }, []);


  useEffect(() => {
    loadTeamsFallbackIfNeeded(state);

  }, [state?.teams?.length]);

  const event = state?.event ?? null;
  const isLive = event?.phase === "LIVE";

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

  const picksForSidebar = state?.recentPicks ?? [];
  const picksForBoard = (allPicks && allPicks.length ? allPicks : state?.recentPicks ?? []).slice();

  const teamCount = teams.length;

  const onClock = useMemo(() => {
    const cur = event?.currentPick ?? 1;
    if (!teamCount) return { team: null as Team | null, round: 1, pickInRound: 1 };
    const { round, index } = snakeTeamIndexFromOverallPick(cur, teamCount);
    const pickInRound = snakePickInRound(cur, teamCount);
    return { team: teams[index] ?? null, round, pickInRound };
  }, [event?.currentPick, teamCount, teams]);

  const onDeck = useMemo(() => {
    const cur = (event?.currentPick ?? 1) + 1;
    if (!teamCount) return { team: null as Team | null };
    const { index } = snakeTeamIndexFromOverallPick(cur, teamCount);
    return { team: teams[index] ?? null };
  }, [event?.currentPick, teamCount, teams]);

  const lastPick = useMemo(() => {
    const src = picksForBoard.length ? picksForBoard : picksForSidebar;
    if (!src.length) return null;
    return src.slice().sort((a, b) => (a.overallNumber ?? 0) - (b.overallNumber ?? 0)).at(-1) ?? null;
  }, [picksForBoard, picksForSidebar]);

  const maxRoundSeen = picksForBoard.reduce((m, p) => Math.max(m, p.round), 1);
  const computedRoundsNeeded = Math.max(DEFAULT_ROUNDS, maxRoundSeen);

  const pickLookup = useMemo(() => {
    const map = new Map<string, DraftPick>();
    for (const p of picksForBoard) map.set(`${p.round}:${p.team.id}`, p);
    return map;
  }, [picksForBoard]);

  const filteredRemaining = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return remaining;
    return remaining.filter((p) => (p.fullName ?? "").toLowerCase().includes(s));
  }, [remaining, q]);

  const remainingCount = remaining.length;
  const draftedCount = (state?.counts?.drafted ?? 0);

  function openDraftModal(opts: { round: number; team: Team; pickInRound: number; overall?: number | null }) {
    setPickErr(null);
    setPickSearch("");
    setDraftRound(opts.round);
    setDraftTeam(opts.team);
    setDraftPickInRound(opts.pickInRound);
    setDraftOverall(opts.overall ?? null);
    setDraftOpen(true);
  }

  const modalFilteredPlayers = useMemo(() => {
    const s = pickSearch.trim().toLowerCase();
    if (!s) return remaining;
    return remaining.filter((p) => (p.fullName ?? "").toLowerCase().includes(s));
  }, [pickSearch, remaining]);


  async function adminMakePick(playerId: string) {
    if (!draftTeam) return;
    setPickBusy(true);
    setPickErr(null);
    try {
      const res = await fetch("/api/draft/admin/pick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: draftTeam.id,
          round: draftRound,
          pickInRound: draftPickInRound,
          overallNumber: draftOverall,
          playerId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Failed to draft player");
      }
      setDraftOpen(false);
      await loadState();
      await loadAllPicksOptional();
      await loadRemaining();
    } catch (e: any) {
      setPickErr(e?.message ?? "Failed to draft player");
    } finally {
      setPickBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-lg font-semibold">Loading…</div>
        <div className="mt-2 text-sm text-muted-foreground">Connecting to draft state</div>
      </div>
    );
  }

  // Countdown page
  if (!isLive) {
    return (
      <div className="py-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight">Live Draft</h1>
            <Pill tone="neutral">Status: {event?.phase ?? "SETUP"}</Pill>
          </div>
          <p className="text-sm text-muted-foreground">Countdown to {scheduledLabel}</p>
        </div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="text-4xl font-bold tabular-nums">{scheduledDays}</div>
            <div className="mt-1 text-sm text-muted-foreground">Days</div>
          </div>
          <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="text-4xl font-bold tabular-nums">{pad2(scheduledHours)}</div>
            <div className="mt-1 text-sm text-muted-foreground">Hours</div>
          </div>
          <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="text-4xl font-bold tabular-nums">{pad2(scheduledMinutes)}</div>
            <div className="mt-1 text-sm text-muted-foreground">Minutes</div>
          </div>
          <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="text-4xl font-bold tabular-nums">{pad2(scheduledSeconds)}</div>
            <div className="mt-1 text-sm text-muted-foreground">Seconds</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">Draft Event</div>
              <div className="mt-1 font-semibold">{event?.name ?? "CYS Draft"}</div>
            </div>
            <div className="flex items-center gap-2">
              <Pill tone="neutral">Remaining: {remainingCount}</Pill>
              <Pill tone="neutral">Drafted: {draftedCount}</Pill>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LIVE PAGE
  return (
    <div className="py-3">
      {/* Draft modal */}
      <Modal
        open={draftOpen}
        title={
          draftTeam
            ? `Draft a player — ${draftTeam.name} (Round ${draftRound})`
            : "Draft a player"
        }
        onClose={() => setDraftOpen(false)}
      >
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="neutral">Round {draftRound}</Pill>
              <Pill tone="neutral">Pick in round {draftPickInRound}</Pill>
              {draftOverall ? <Pill tone="neutral">Overall #{draftOverall}</Pill> : <Pill tone="warn">Out-of-order</Pill>}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Admin can fill picks in any order. This assigns the player to this team + round slot.
            </div>
          </div>

          <input
            value={pickSearch}
            onChange={(e) => setPickSearch(e.target.value)}
            placeholder="Search remaining players…"
            className="h-10 w-full rounded-md border px-3 text-sm"
          />

          {pickErr ? <div className="text-sm text-rose-600">{pickErr}</div> : null}

          <div className="rounded-2xl border overflow-hidden">
            <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-semibold">
              <div className="col-span-8">Player</div>
              <div className="col-span-4">Rating</div>
            </div>
            <div className="max-h-[360px] overflow-auto divide-y">
              {modalFilteredPlayers.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground">No matches.</div>
              ) : (
                modalFilteredPlayers.map((p) => (
                  <button
                    key={p.id}
                    disabled={pickBusy}
                    onClick={() => adminMakePick(p.id)}
                    className="w-full text-left grid grid-cols-12 px-3 py-2 hover:bg-muted/40 transition disabled:opacity-50"
                  >
                    <div className="col-span-8 font-semibold truncate">{p.fullName}</div>
                    <div className="col-span-4 flex items-center"><Stars value={p.rating} /></div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* HERO HEADER */}
      <div
        className={cx(
          "rounded-3xl border p-5 sm:p-6 shadow-sm",
          event?.isPaused ? "bg-amber-50/60 dark:bg-amber-950/20" : "bg-emerald-50/60 dark:bg-emerald-950/20"
        )}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Live Draft Board</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                {event?.name ?? "CYS Draft"} · Scheduled: {scheduledLabel}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {event?.isPaused ? <Pill tone="warn">⏸ Paused</Pill> : <Pill tone="good">● Live</Pill>}
                <Pill tone="neutral">Pick #{event?.currentPick ?? 1}</Pill>
                <Pill tone="neutral">Teams: {teams.length}</Pill>
                <Pill tone="neutral">Drafted: {draftedCount}</Pill>
                <Pill tone="neutral">Remaining: {remainingCount}</Pill>
                {allPicks ? <Pill tone="neutral">Board: All picks</Pill> : <Pill tone="warn">Board: Recent picks only</Pill>}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
              <div className="rounded-2xl border bg-card px-4 py-3 shadow-sm min-w-[240px]">
                <div className="text-xs text-muted-foreground">Pick Clock</div>
                <div className="mt-1 text-4xl font-bold tabular-nums tracking-tight">
                  {pad2(liveMin)}:{pad2(liveSec)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {event?.isPaused ? "Paused — clock held" : "Time remaining for current pick"}
                </div>
              </div>

              <div className="rounded-2xl border bg-card px-4 py-3 shadow-sm min-w-[260px]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Last Pick</div>
                    <div className="mt-1 text-sm font-semibold truncate">{lastPick?.player.fullName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{lastPick ? lastPick.team.name : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">On Deck</div>
                    <div className="mt-1 text-sm font-semibold truncate">{onDeck.team?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">After: {onClock.team?.name ?? "—"}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-card px-4 py-3 shadow-sm min-w-[260px]">
                <div className="text-xs text-muted-foreground">On the Clock</div>
                <div className="mt-1 text-xl font-semibold truncate">{onClock.team?.name ?? "—"}</div>
                <div className="mt-2 flex items-center gap-2">
                  {!event?.isPaused ? <Pill tone="good">● Picking now</Pill> : <Pill tone="warn">⏸ Waiting</Pill>}
                  <Pill tone="neutral">R{onClock.round} · P{onClock.pickInRound}</Pill>
                </div>
              </div>
            </div>
          </div>

          {!teams.length ? (
            <div className="rounded-2xl border bg-card p-4 text-sm">
              <div className="font-semibold">No teams loaded</div>
              <div className="text-muted-foreground mt-1">
                Your <span className="font-semibold">/api/draft/state</span> is returning an empty teams array.
                This page will auto-fallback to <span className="font-semibold">{FALLBACK_TEAMS_ENDPOINT}</span> if it exists.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="mt-5 grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* BOARD */}
        <div className="xl:col-span-8">
          <div className="rounded-3xl border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Draft Board</div>
                  <div className="text-xs text-muted-foreground">
                    Snake draft · rounds down the left · teams across the top · click a cell to assign a pick (Admin)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone="neutral">{teams.length} teams</Pill>
                  <Pill tone="neutral">{computedRoundsNeeded} rounds</Pill>
                </div>
              </div>
            </div>

            <div className="max-h-[72vh] overflow-auto">
              <div className={cx("min-w-[980px]", teams.length > 8 && "min-w-[1400px]")}>
                {/* Header row */}
                <div
                  className="sticky top-0 z-20 grid"
                  style={{ gridTemplateColumns: `90px repeat(${Math.max(teams.length, 1)}, minmax(180px, 1fr))` }}
                >
                  <div className="bg-muted/70 backdrop-blur border-b px-3 py-3 text-xs font-semibold sticky left-0 z-30">
                    Round
                  </div>

                  {(teams.length ? teams : [{ id: "x", name: "Teams", order: 1 }]).map((t) => (
                    <div key={t.id} className="bg-muted/70 backdrop-blur border-b px-3 py-3 text-xs font-semibold">
                      <div className="truncate">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground font-normal">Order #{t.order}</div>
                    </div>
                  ))}
                </div>

                {/* Rows */}
                <div className="divide-y">
                  {Array.from({ length: computedRoundsNeeded }).map((_, rIdx) => {
                    const round = rIdx + 1;

                    return (
                      <div
                        key={round}
                        className="grid"
                        style={{ gridTemplateColumns: `90px repeat(${Math.max(teams.length, 1)}, minmax(180px, 1fr))` }}
                      >
                        <div className="sticky left-0 z-10 bg-card px-3 py-3 text-sm font-semibold border-r">
                          {round}
                        </div>

                        {(teams.length ? teams : [{ id: "x", name: "—", order: 1 }]).map((t) => {
                          const pick = teams.length ? pickLookup.get(`${round}:${t.id}`) ?? null : null;

                          const isCurrentCell =
                            !event?.isPaused &&
                            teams.length > 0 &&
                            round === onClock.round &&
                            t.id === onClock.team?.id;

                          const isNextCell =
                            teams.length > 0 &&
                            round === onClock.round &&
                            t.id === onDeck.team?.id;


                          const teamIdx = teams.findIndex((x) => x.id === t.id);
                          const isReverse = round % 2 === 0;
                          const posInRound = isReverse ? (teams.length - 1 - teamIdx) : teamIdx;
                          const expectedOverall = teams.length ? (round - 1) * teams.length + posInRound + 1 : null;

                          const expectedPickInRound = teams.length ? posInRound + 1 : 1;

                          return (
                            <button
                              type="button"
                              key={`${round}-${t.id}`}
                              onClick={() => {
                                const useOverall = isCurrentCell || isNextCell ? expectedOverall : null;
                                openDraftModal({
                                  round,
                                  team: t,
                                  pickInRound: expectedPickInRound,
                                  overall: useOverall,
                                });
                              }}
                              className={cx(
                                "px-3 py-3 text-left border-l first:border-l-0",
                                pick ? "bg-background" : "bg-background/50",
                                "hover:bg-muted/40 transition",
                                isCurrentCell && "bg-emerald-50/80 dark:bg-emerald-950/25",
                                isNextCell && "bg-amber-50/60 dark:bg-amber-950/20"
                              )}
                            >
                              {pick ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs rounded-full border bg-muted px-2 py-0.5">#{pick.overallNumber}</span>
                                    <span className="text-[11px] text-muted-foreground">P{pick.pickInRound}</span>
                                  </div>
                                  <div className="font-semibold leading-snug">{pick.player.fullName}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {pick.player.rank != null ? `Rank ${pick.player.rank}` : ""}
                                  </div>
                                </div>
                              ) : (
                                <div className="h-full flex items-center justify-between gap-2">
                                  <div className="text-sm text-muted-foreground/70">
                                    {isCurrentCell ? (
                                      <span className="font-semibold text-emerald-700 dark:text-emerald-200">On the clock</span>
                                    ) : isNextCell ? (
                                      <span className="font-semibold text-amber-700 dark:text-amber-200">On deck</span>
                                    ) : (
                                      <span>—</span>
                                    )}
                                  </div>
                                  {isCurrentCell ? <Pill tone="good">Pick</Pill> : isNextCell ? <Pill tone="warn">Next</Pill> : null}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t text-xs text-muted-foreground">
              Admin: click any cell to assign a player to that team + round slot (out-of-order supported).
            </div>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className="xl:col-span-4 space-y-4">
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Recent Picks</div>
                <div className="text-xs text-muted-foreground">Latest selections as they come in</div>
              </div>
              <Pill tone="neutral">{picksForSidebar.length} shown</Pill>
            </div>

            <div className="mt-3 divide-y">
              {picksForSidebar.length === 0 ? (
                <div className="py-6 text-sm text-muted-foreground">No picks yet.</div>
              ) : (
                picksForSidebar.map((p) => (
                  <div key={p.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs rounded-full border bg-muted px-2 py-0.5">#{p.overallNumber}</span>
                        <div className="font-semibold truncate">{p.team.name}</div>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground truncate">
                        {p.player.fullName}
                        {p.player.rank !== null ? ` · Rank ${p.player.rank}` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      R{p.round} · P{p.pickInRound}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Remaining Players</div>
                <div className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold">{filteredRemaining.length}</span> of{" "}
                  <span className="font-semibold">{remaining.length}</span>
                </div>
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="h-9 w-44 rounded-md border px-3 text-sm"
              />
            </div>

            <div className="mt-3 rounded-2xl border overflow-hidden">
              <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold sticky top-0">
                <div className="col-span-8">Player</div>
                <div className="col-span-4">Rating</div>
              </div>

              {filteredRemaining.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground">No matches.</div>
              ) : (
                <div className="divide-y max-h-[520px] overflow-auto">
                  {filteredRemaining.map((p) => (
                    <div key={p.id} className="grid grid-cols-12 gap-0 px-3 py-2 text-sm hover:bg-muted/40 transition">
                      <div className="col-span-8 font-semibold truncate">{p.fullName}</div>
                      <div className="col-span-4 flex items-center">
                        <Stars value={p.rating} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              Remaining count shown above is the remaining list only (not total registered).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

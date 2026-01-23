"use client";

import React, { useEffect, useMemo, useState } from "react";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

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
  recentPicks: {
    id: string;
    overallNumber: number;
    round: number;
    pickInRound: number;
    madeAt: string;
    team: { id: string; name: string; order: number };
    player: { id: string; fullName: string; rank: number | null };
  }[];
  counts: { undrafted: number; drafted: number };
};

type RemainingPlayer = {
  id: string;
  fullName: string;
  jerseySize: string | null;
};

export default function LiveDraftPage() {
  const fallbackScheduledTarget = useMemo(() => new Date(Date.UTC(2026, 1, 16, 23, 0, 0)), []);
  const [now, setNow] = useState(() => new Date());

  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState<RemainingPlayer[]>([]);

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

  async function loadRemaining() {
    try {
      const res = await fetch("/api/draft/players?eligible=true&drafted=false", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setRemaining(
        (json.players ?? []).map((p: any) => ({ id: p.id, fullName: p.fullName, jerseySize: p.jerseySize ?? null }))
      );
    } catch {
      setRemaining([]);
    }
  }

  useEffect(() => {
    loadState();
    loadRemaining();
    const t = setInterval(() => {
      loadState();
      loadRemaining();
    }, 2000);
    return () => clearInterval(t);
  }, []);

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
    if (!event) return { remaining: null as number | null, endsAt: null as Date | null };

    if (event.isPaused) {
      const remaining = event.pauseRemainingSecs ?? event.pickClockSeconds;
      return { remaining, endsAt: null };
    }

    if (!event.clockEndsAt) return { remaining: null, endsAt: null };

    const endsAt = new Date(event.clockEndsAt);
    const remaining = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 1000));
    return { remaining, endsAt };
  }, [event, now]);

  const liveRemaining = liveClock.remaining;
  const liveTotalSeconds = liveRemaining ?? 0;
  const liveMin = Math.floor(liveTotalSeconds / 60);
  const liveSec = liveTotalSeconds % 60;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-lg font-semibold">Loading…</div>
      </div>
    );
  }

  if (!isLive) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Live Draft</h1>
        <p className="mt-2 text-sm text-muted-foreground">Countdown to {scheduledLabel}</p>

        <div className="mt-8 grid grid-cols-4 gap-4 w-full max-w-2xl">
          <div className="rounded-xl border bg-card p-6 text-center">
            <div className="text-4xl font-bold">{scheduledDays}</div>
            <div className="mt-1 text-sm text-muted-foreground">Days</div>
          </div>
          <div className="rounded-xl border bg-card p-6 text-center">
            <div className="text-4xl font-bold">{pad2(scheduledHours)}</div>
            <div className="mt-1 text-sm text-muted-foreground">Hours</div>
          </div>
          <div className="rounded-xl border bg-card p-6 text-center">
            <div className="text-4xl font-bold">{pad2(scheduledMinutes)}</div>
            <div className="mt-1 text-sm text-muted-foreground">Minutes</div>
          </div>
          <div className="rounded-xl border bg-card p-6 text-center">
            <div className="text-4xl font-bold">{pad2(scheduledSeconds)}</div>
            <div className="mt-1 text-sm text-muted-foreground">Seconds</div>
          </div>
        </div>

        <div className="mt-8 rounded-lg border bg-card px-4 py-3 text-center">
          <div className="text-sm text-muted-foreground">
            Draft status: <span className="font-semibold">{event?.phase ?? "SETUP"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Live Draft Board</h1>
        <div className="text-sm text-muted-foreground">
          Pick <span className="font-semibold">{event?.currentPick ?? 1}</span>{" "}
          {event?.isPaused ? (
            <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs">Paused</span>
          ) : (
            <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs">Live</span>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm text-muted-foreground">Pick Clock</div>
          <div className="mt-2 text-5xl font-bold tabular-nums">
            {pad2(liveMin)}:{pad2(liveSec)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {event?.isPaused ? "Paused" : "Time remaining for current pick"}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="text-sm text-muted-foreground">Recent Picks</div>

          <div className="mt-3 divide-y">
            {(state?.recentPicks ?? []).length === 0 ? (
              <div className="py-4 text-sm text-muted-foreground">No picks yet.</div>
            ) : (
              (state?.recentPicks ?? []).map((p) => (
                <div key={p.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      #{p.overallNumber} · {p.team.name}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {p.player.fullName}
                      {p.player.rank !== null ? ` · Rank ${p.player.rank}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    R{p.round} P{p.pickInRound}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Remaining Players</div>
              <div className="text-xs text-muted-foreground">
                Remaining: <span className="font-semibold">{remaining.length}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border overflow-hidden">
            <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
              <div className="col-span-9">Player</div>
              <div className="col-span-3">Jersey</div>
            </div>
            {remaining.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">No remaining players.</div>
            ) : (
              <div className="divide-y max-h-[420px] overflow-auto">
                {remaining.map((p) => (
                  <div key={p.id} className="grid grid-cols-12 gap-0 px-3 py-2 text-sm">
                    <div className="col-span-9 font-semibold">{p.fullName}</div>
                    <div className="col-span-3 text-muted-foreground">{p.jerseySize ?? ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="text-sm text-muted-foreground">Team Order</div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(state?.teams ?? []).map((t) => {
                const expectedIndex = ((event?.currentPick ?? 1) - 1) % Math.max(1, (state?.teams ?? []).length);
                const onClock = (state?.teams ?? [])[expectedIndex]?.id === t.id && !event?.isPaused;
                return (
                  <div key={t.id} className={`rounded-lg border p-3 ${onClock ? "ring-2 ring-offset-2" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        {t.order}. {t.name}
                      </div>
                      {onClock ? <span className="text-xs rounded-full border px-2 py-0.5">On the clock</span> : null}
                    </div>
                  </div>
                );
              })}
              {(state?.teams ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No teams configured yet.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  formatPlayerHistoryNarrative,
  getPlayerHistory,
  type PlayerDraftHistoryEntry,
} from "@/lib/playerHistory";
import { PlayerHistoryProvider, usePlayerHistoryIndex } from "@/components/PlayerHistoryProvider";

type Role = "ADMIN" | "BOARD" | "COACH" | "PARENT";

type Player = {
  id: string;
  fullName: string;
  notes: string | null;
  experience: string | null;
  fall2025Rating: number | null;
};

type SessionUser = { id?: string; role?: Role } | null;

function stableHash(players: any[]) {
  try {
    return JSON.stringify(
      (players ?? []).map((p) => ({
        id: p.id,
        fullName: p.fullName,
        experience: p.experience ?? null,
        fall2025Rating: p.fall2025Rating ?? null,
        notes: p.notes ?? null,
      }))
    );
  } catch {
    return String(Date.now());
  }
}

function RemainingPlayersInner() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<SessionUser>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { index: historyIndex } = usePlayerHistoryIndex();

  const lastHashRef = useRef<string>("");
  const hasLoadedOnceRef = useRef(false);

  const canSave = sessionUser?.role === "ADMIN";

  async function loadSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const json = await res.json();
      setSessionUser(json?.user ?? null);
    } catch {
      setSessionUser(null);
    }
  }

  async function loadPlayers(silent?: boolean) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/draft/players?eligible=true&drafted=false", { cache: "no-store" });
      const json = await res.json();
      const nextPlayers = json.players ?? [];
      const nextHash = stableHash(nextPlayers);

      if (nextHash !== lastHashRef.current) {
        lastHashRef.current = nextHash;
        setPlayers(nextPlayers);
      }
    } finally {
      if (!silent) setLoading(false);
      if (!hasLoadedOnceRef.current) {
        hasLoadedOnceRef.current = true;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadSession();
    loadPlayers(false);
    const t = setInterval(() => loadPlayers(true), 2000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return players;
    return players.filter((p) => (p.fullName ?? "").toLowerCase().includes(s));
  }, [players, q]);

  function setField(id: string, patch: Partial<Player>) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function saveRow(p: Player) {
    if (!canSave) return;
    setSavingId(p.id);
    try {
      await fetch("/api/draft/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: [
            {
              id: p.id,
              rank: null,
              notes: p.notes ?? null,
              experience: (p.experience ?? "").toString(),
              fall2025Rating: p.fall2025Rating ?? null,
              spring2025Rating: null,
            },
          ],
        }),
      });
      await loadPlayers(true);
    } finally {
      setSavingId(null);
    }
  }

  function historyFor(p: Player): PlayerDraftHistoryEntry[] {
    return getPlayerHistory(historyIndex, p.fullName);
  }

  return (
    <div className="py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Remaining Players</h1>
        <div className="text-sm text-muted-foreground">Auto-updates during the live draft.</div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player..."
          className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
        />
        <button onClick={() => loadPlayers(false)} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
          <div className="col-span-3">Player</div>
          <div className="col-span-1">Rating</div>
          <div className="col-span-7">Parent&apos;s Comment</div>
          <div className="col-span-1 text-right">Save</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No remaining players.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((p) => {
              const expanded = expandedId === p.id;
              const h = historyFor(p);

              const narrative = h.length
                ? formatPlayerHistoryNarrative({
                    playerFullName: p.fullName,
                    history: h,
                    ratings: {
                      fall2025: p.fall2025Rating ?? null,
                    },
                  })
                : "";

              const parentComment = (p.notes ?? "").trim() || (p.experience ?? "").trim();

              return (
                <div key={p.id}>
                  <div className="grid grid-cols-12 gap-0 px-3 py-3 text-sm items-center">
                    <div className="col-span-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
                        className="font-semibold hover:underline text-left"
                      >
                        {p.fullName}
                      </button>
                    </div>

                    <div className="col-span-1">
                      {canSave ? (
                        <input
                          type="number"
                          value={p.fall2025Rating ?? ""}
                          onChange={(e) =>
                            setField(p.id, {
                              fall2025Rating: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="w-full rounded-md border px-2 py-1 text-sm"
                        />
                      ) : (
                        <div className="text-muted-foreground">{p.fall2025Rating ?? ""}</div>
                      )}
                    </div>

                    <div className="col-span-7">
                      <div className="text-muted-foreground whitespace-pre-wrap break-words">
                        {parentComment}
                      </div>
                    </div>

                    <div className="col-span-1 flex justify-end">
                      {canSave ? (
                        <button
                          onClick={() => saveRow(p)}
                          disabled={savingId === p.id}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
                        >
                          {savingId === p.id ? "Saving…" : "Save"}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground"></span>
                      )}
                    </div>
                  </div>

                  {expanded ? (
                    <div className="px-3 pb-4">
                      <div className="rounded-lg border bg-background p-3 text-sm">
                        <div className="font-semibold">Previous Draft History</div>

                        {h.length ? (
                          <>
                            {narrative ? <div className="mt-1 text-muted-foreground">{narrative}</div> : null}
                            <div className="mt-3 grid gap-2">
                              {h.map((e, idx) => (
                                <div
                                  key={`${e.season}-${e.year}-${e.overallPick}-${idx}`}
                                  className="text-muted-foreground"
                                >
                                  {e.year} {e.seasonLabel}: drafted {e.overallPick} overall (Round {e.round}, Pick{" "}
                                  {e.pickInRound}) by {e.teamName}
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="mt-1 text-muted-foreground">No prior draft history found.</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RemainingPlayersPage() {
  return (
    <PlayerHistoryProvider>
      <RemainingPlayersInner />
    </PlayerHistoryProvider>
  );

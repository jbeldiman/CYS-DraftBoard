"use client";

import React, { useEffect, useMemo, useState } from "react";

type Role = "ADMIN" | "BOARD" | "COACH" | "PARENT";

type Player = {
  id: string;
  fullName: string;
  notes: string | null;
  experience: string | null;
  fall2025Rating: number | null;
  isDrafted: boolean;
  draftedTeam: { name: string; order: number } | null;
};

type SessionUser = { id?: string; role?: Role } | null;

export default function FullEligiblePlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<SessionUser>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const canEdit = sessionUser?.role === "ADMIN" || sessionUser?.role === "BOARD";

  async function loadSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const json = await res.json();
      setSessionUser(json?.user ?? null);
    } catch {
      setSessionUser(null);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/draft/players?eligible=true", { cache: "no-store" });
      const json = await res.json();
      setPlayers(json.players ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
    load();
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
    if (!canEdit) return;
    setSavingId(p.id);
    try {
      await fetch("/api/draft/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: [
            {
              id: p.id,
              fullName: p.fullName,
              rank: null,
              notes: p.notes ?? null,
              experience: (p.experience ?? "").toString(),
              fall2025Rating: p.fall2025Rating ?? null,
              spring2025Rating: null,
            },
          ],
        }),
      });
      await load();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Full Eligible Players</h1>
        <div className="text-sm text-muted-foreground">Players born 12/01/2012 – 12/31/2016 with U13 selected.</div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player..."
          className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
        />
        <button onClick={load} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
          <div className="col-span-3">Player</div>
          <div className="col-span-7">Parent&apos;s Comment</div>
          <div className="col-span-1">Rating</div>
          <div className="col-span-1 text-right">Save</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No eligible players found.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((p) => (
              <div key={p.id} className="grid grid-cols-12 gap-0 px-3 py-3 text-sm items-center">
                <div className="col-span-3 font-semibold">{p.fullName}</div>

                <div className="col-span-7">
                  <div className="text-muted-foreground truncate" title={p.experience ?? ""}>
                    {p.experience ?? ""}
                  </div>
                </div>

                <div className="col-span-1">
                  {canEdit ? (
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

                <div className="col-span-1 flex justify-end">
                  {canEdit ? (
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";

type Player = {
  id: string;
  fullName: string;
  dob: string | null;
  leagueChoice: string | null;
  jerseySize: string | null;
  notes: string | null;
};

export default function RemainingPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/draft/players?eligible=true&drafted=false", { cache: "no-store" });
      const json = await res.json();
      setPlayers(json.players ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return players;
    return players.filter((p) => (p.fullName ?? "").toLowerCase().includes(s));
  }, [players, q]);

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
        <button
          onClick={load}
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
          <div className="col-span-4">Player</div>
          <div className="col-span-2">DOB</div>
          <div className="col-span-3">League</div>
          <div className="col-span-3">Jersey</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No remaining players.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((p) => (
              <div key={p.id} className="grid grid-cols-12 gap-0 px-3 py-3 text-sm">
                <div className="col-span-4 font-semibold">{p.fullName}</div>
                <div className="col-span-2 text-muted-foreground">
                  {p.dob ? new Date(p.dob).toLocaleDateString() : ""}
                </div>
                <div className="col-span-3 text-muted-foreground">{p.leagueChoice ?? ""}</div>
                <div className="col-span-3 text-muted-foreground">{p.jerseySize ?? ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
"use client";

import React, { useEffect, useState } from "react";

type Team = { id: string; name: string; order: number };
type Player = {
  id: string;
  fullName: string;
  dob: string | null;
  gender: string | null;
  jerseySize: string | null;
  guardian1Name: string | null;
  guardian2Name: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
};

export default function MyRosterPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch("/api/draft/team/me", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load roster");
      return;
    }

    setTeam(json.team ?? null);
    setPlayers(json.players ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  if (err) {
    return (
      <div className="py-8">
        <h1 className="text-3xl font-semibold tracking-tight">My Roster</h1>
        <div className="mt-4 text-sm text-red-600">{err}</div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">My Roster</h1>
        <div className="text-sm text-muted-foreground">
          {team ? `Team: ${team.name}` : "No team assigned to this coach yet."}
        </div>
      </div>

      <div className="mt-6 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
          <div className="col-span-3">Player</div>
          <div className="col-span-2">DOB</div>
          <div className="col-span-1">Gender</div>
          <div className="col-span-2">Jersey</div>
          <div className="col-span-2">Guardian(s)</div>
          <div className="col-span-2">Contact</div>
        </div>

        {players.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            No drafted players yet.
          </div>
        ) : (
          <div className="divide-y">
            {players.map((p) => (
              <div key={p.id} className="grid grid-cols-12 gap-0 px-3 py-3 text-sm">
                <div className="col-span-3 font-semibold">{p.fullName}</div>
                <div className="col-span-2 text-muted-foreground">
                  {p.dob ? new Date(p.dob).toLocaleDateString() : ""}
                </div>
                <div className="col-span-1 text-muted-foreground">{p.gender ?? ""}</div>
                <div className="col-span-2 text-muted-foreground">{p.jerseySize ?? ""}</div>
                <div className="col-span-2 text-muted-foreground">
                  {[p.guardian1Name, p.guardian2Name].filter(Boolean).join(" / ")}
                </div>
                <div className="col-span-2 text-muted-foreground">
                  <div>{p.primaryPhone ?? ""}</div>
                  <div className="text-xs">{p.primaryEmail ?? ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
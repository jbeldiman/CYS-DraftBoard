"use client";

import React, { useEffect, useState } from "react";

type Team = {
  id: string;
  name: string;
  order: number;
  coachUser: { id: string; name: string | null; email: string } | null;
  players: {
    id: string;
    fullName: string;
    dob: string | null;
    gender: string | null;
    jerseySize: string | null;
    guardian1Name: string | null;
    guardian2Name: string | null;
    primaryPhone: string | null;
    primaryEmail: string | null;
  }[];
};

export default function FullRostersAdminPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch("/api/draft/admin/full-rosters", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json?.error ?? "Failed to load full rosters");
      return;
    }
    setTeams(json.teams ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Full Rosters</h1>
        <div className="text-sm text-muted-foreground">
          Admin-only: teams + coach + drafted players (for jersey ordering).
        </div>
      </div>

      {err ? <div className="mt-4 text-sm text-red-600">{err}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4">
        {teams.map((t) => (
          <div key={t.id} className="rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-1">
              <div className="text-lg font-semibold">
                {t.order}. {t.name}
              </div>
              <div className="text-sm text-muted-foreground">
                Coach: {t.coachUser?.name ?? "(no name)"} · {t.coachUser?.email ?? "(unassigned)"}
              </div>
            </div>

            <div className="mt-4 rounded-lg border overflow-hidden">
              <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
                <div className="col-span-3">Player</div>
                <div className="col-span-2">DOB</div>
                <div className="col-span-1">Gender</div>
                <div className="col-span-2">Jersey</div>
                <div className="col-span-2">Guardian(s)</div>
                <div className="col-span-2">Contact</div>
              </div>

              {t.players.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  No drafted players yet.
                </div>
              ) : (
                <div className="divide-y">
                  {t.players.map((p) => (
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
        ))}
        {teams.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No teams configured yet. Add teams in your existing Teams admin endpoint when ready.
          </div>
        ) : null}
      </div>
    </div>
  );
}
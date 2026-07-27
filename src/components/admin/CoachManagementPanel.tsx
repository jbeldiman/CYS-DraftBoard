"use client";

import { useEffect, useMemo, useState } from "react";

type Division = "U11" | "U13";

type Coach = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  coachOrder: number;
  coachDivision: Division | null;
  isDraftCoach: boolean;
};

type Counts = {
  U11: number;
  U13: number;
  UNASSIGNED: number;
  total: number;
};

const EMPTY_COUNTS: Counts = { U11: 0, U13: 0, UNASSIGNED: 0, total: 0 };

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

async function apiMessage(response: Response) {
  const json = await response.json().catch(() => ({}));
  return { json, message: json?.error ?? json?.message ?? `Request failed (${response.status})` };
}

export default function CoachManagementPanel({
  activeDivision,
  onTeamsChanged,
}: {
  activeDivision: Division | null;
  onTeamsChanged?: () => Promise<void> | void;
}) {
  const [allCoaches, setAllCoaches] = useState<Coach[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [selectedDivision, setSelectedDivision] = useState<Division>(activeDivision ?? "U11");
  const [draftOrderInput, setDraftOrderInput] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminCoachName, setAdminCoachName] = useState("Joseph Beldiman");

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const coaches = useMemo(
    () =>
      allCoaches
        .filter((coach) => coach.coachDivision === selectedDivision)
        .sort((a, b) => a.coachOrder - b.coachOrder || a.createdAt.localeCompare(b.createdAt)),
    [allCoaches, selectedDivision]
  );

  async function loadCoaches() {
    const response = await fetch("/api/admin/coaches", { cache: "no-store" });
    const { json, message: apiError } = await apiMessage(response);
    if (!response.ok) throw new Error(apiError);
    setAllCoaches(Array.isArray(json?.users) ? json.users : []);
    setCounts(json?.counts ?? EMPTY_COUNTS);
  }

  useEffect(() => {
    loadCoaches().catch((loadError) => setError(loadError?.message ?? "Failed to load coaches"));
  }, []);

  useEffect(() => {
    if (activeDivision) setSelectedDivision(activeDivision);
  }, [activeDivision]);

  useEffect(() => {
    const next: Record<string, string> = {};
    coaches.forEach((coach, index) => {
      next[coach.id] = String(index + 1);
    });
    setDraftOrderInput(next);
  }, [coaches]);

  async function syncIfActiveDivision() {
    if (activeDivision !== selectedDivision) return false;
    const response = await fetch("/api/draft/admin/sync-teams", { method: "POST" });
    const { message: apiError } = await apiMessage(response);
    if (!response.ok) throw new Error(apiError);
    await onTeamsChanged?.();
    return true;
  }

  async function saveOrder(ordered: Coach[], successMessage: string) {
    const response = await fetch("/api/admin/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ division: selectedDivision, coachIds: ordered.map((coach) => coach.id) }),
    });
    const { message: apiError } = await apiMessage(response);
    if (!response.ok) throw new Error(apiError);

    await loadCoaches();
    const synced = await syncIfActiveDivision();
    setMessage(`${successMessage}${synced ? " Teams synced to the active draft." : " Activate this division to sync its teams."}`);
  }

  async function createCoach(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy("create");
    try {
      const response = await fetch("/api/admin/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, division: selectedDivision }),
      });
      const { json, message: apiError } = await apiMessage(response);
      if (!response.ok) throw new Error(apiError);
      setName("");
      setEmail("");
      setPassword("");
      await loadCoaches();
      setMessage(`${json?.user?.name ?? "Coach"} added to ${selectedDivision}.`);
    } catch (createError: any) {
      setError(createError?.message ?? "Failed to create coach");
    } finally {
      setBusy(null);
    }
  }

  async function includeCurrentAdmin() {
    setError(null);
    setMessage(null);
    if (!adminCoachName.trim()) {
      setError("Enter the Admin coach name first.");
      return;
    }
    setBusy("include-admin");
    try {
      const response = await fetch("/api/admin/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "includeCurrentAdmin",
          name: adminCoachName.trim(),
          division: selectedDivision,
        }),
      });
      const { json, message: apiError } = await apiMessage(response);
      if (!response.ok) throw new Error(apiError);
      await loadCoaches();
      setMessage(`${json?.user?.name ?? "Admin"} is now included as a ${selectedDivision} draft coach.`);
    } catch (includeError: any) {
      setError(includeError?.message ?? "Failed to include Admin as a coach");
    } finally {
      setBusy(null);
    }
  }

  async function removeCoach(coach: Coach) {
    const confirmed = window.confirm(
      `Remove ${coach.name ?? coach.email} from the ${coach.coachDivision ?? "unassigned"} coach roster?\n\nThe account and historical records will be preserved.`
    );
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    setBusy(coach.id);
    try {
      const response = await fetch(`/api/admin/coaches/${encodeURIComponent(coach.id)}`, { method: "DELETE" });
      const { message: apiError } = await apiMessage(response);
      if (!response.ok) throw new Error(apiError);
      await loadCoaches();
      setMessage(`${coach.name ?? coach.email} removed from the active coach roster. History preserved.`);
    } catch (removeError: any) {
      setError(removeError?.message ?? "Failed to remove coach");
    } finally {
      setBusy(null);
    }
  }

  async function clearCoachRoster() {
    const confirmation = window.prompt(
      "This clears every current U11/U13 coach assignment while preserving accounts, past teams, picks, trades, and history.\n\nType CLEAR COACHES to continue."
    );
    if (confirmation !== "CLEAR COACHES") return;

    setError(null);
    setMessage(null);
    setBusy("clear");
    try {
      const response = await fetch("/api/admin/coaches?all=true", { method: "DELETE" });
      const { json, message: apiError } = await apiMessage(response);
      if (!response.ok) throw new Error(apiError);
      await loadCoaches();
      setMessage(`${json?.cleared ?? 0} old coach assignments cleared. Accounts and history were preserved.`);
    } catch (clearError: any) {
      setError(clearError?.message ?? "Failed to clear coach roster");
    } finally {
      setBusy(null);
    }
  }

  async function randomizeOrder() {
    if (coaches.length < 2) {
      setError(`Add at least two ${selectedDivision} coaches before randomizing.`);
      return;
    }
    setError(null);
    setMessage(null);
    setBusy("randomize");
    try {
      await saveOrder(shuffle(coaches), `${selectedDivision} draft order randomized and saved.`);
    } catch (randomizeError: any) {
      setError(randomizeError?.message ?? "Failed to randomize order");
    } finally {
      setBusy(null);
    }
  }

  async function saveCustomOrder() {
    if (coaches.length < 2) {
      setError(`Add at least two ${selectedDivision} coaches before setting an order.`);
      return;
    }

    const parsed = coaches.map((coach) => ({ coach, order: Number(draftOrderInput[coach.id]) }));
    if (parsed.some((item) => !Number.isInteger(item.order) || item.order < 1)) {
      setError("Every draft order must be a positive whole number.");
      return;
    }
    if (new Set(parsed.map((item) => item.order)).size !== parsed.length) {
      setError("Draft order numbers must be unique.");
      return;
    }

    setError(null);
    setMessage(null);
    setBusy("custom");
    try {
      const ordered = parsed.sort((a, b) => a.order - b.order).map((item) => item.coach);
      await saveOrder(ordered, `${selectedDivision} custom order saved.`);
    } catch (customError: any) {
      setError(customError?.message ?? "Failed to save custom order");
    } finally {
      setBusy(null);
    }
  }

  async function applyPlannedU13Order() {
    if (selectedDivision !== "U13") return;

    const plan = [
      { label: "Jeff Hunt", match: (name: string) => name === "jeff hunt" },
      { label: "Aaron Sharlow", match: (name: string) => name === "aaron sharlow" },
      { label: "Jacob Harvey", match: (name: string) => name === "jacob harvey" },
      { label: "McPherson", match: (name: string) => name.split(" ").at(-1) === "mcpherson" },
      { label: "Stephen Olliges", match: (name: string) => name === "stephen olliges" },
      { label: "Joseph Beldiman", match: (name: string) => name === "joseph beldiman" },
    ];

    const used = new Set<string>();
    const planned: Coach[] = [];
    const missing: string[] = [];

    for (const slot of plan) {
      const match = coaches.find((coach) => !used.has(coach.id) && slot.match(normalize(coach.name)));
      if (!match) missing.push(slot.label);
      else {
        used.add(match.id);
        planned.push(match);
      }
    }

    if (missing.length) {
      setError(`Cannot apply the planned U13 order yet. Missing: ${missing.join(", ")}.`);
      return;
    }

    const extras = coaches.filter((coach) => !used.has(coach.id));
    setError(null);
    setMessage(null);
    setBusy("planned");
    try {
      await saveOrder([...planned, ...extras], "Planned U13 order applied and saved.");
    } catch (plannedError: any) {
      setError(plannedError?.message ?? "Failed to apply planned U13 order");
    } finally {
      setBusy(null);
    }
  }

  const summaryCards: Array<{ division: Division | "UNASSIGNED"; label: string; count: number }> = [
    { division: "U11", label: "U11 Coaches", count: counts.U11 },
    { division: "U13", label: "U13 Coaches", count: counts.U13 },
    { division: "UNASSIGNED", label: "Needs Assignment", count: counts.UNASSIGNED },
  ];

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Draft-night setup</div>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Coach Rosters & Draft Order</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            U11 and U13 coaches are completely separate. Saving an order only syncs teams when that division is the active draft.
          </p>
        </div>
        <button
          type="button"
          onClick={clearCoachRoster}
          disabled={busy === "clear" || counts.total === 0}
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-black text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "clear" ? "Clearing…" : "Clear Existing Coaches"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {summaryCards.map((card) => {
          const selectable = card.division !== "UNASSIGNED";
          const selected = selectable && selectedDivision === card.division;
          return (
            <button
              type="button"
              key={card.division}
              disabled={!selectable}
              onClick={() => selectable && setSelectedDivision(card.division as Division)}
              className={`rounded-2xl border p-4 text-left transition ${
                selected
                  ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300"
              } disabled:cursor-default`}
            >
              <div className="text-sm font-bold text-slate-600">{card.label}</div>
              <div className="mt-1 text-3xl font-black text-slate-950">{card.count}</div>
            </button>
          );
        })}
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
      {message ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          {message}
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <form onSubmit={createCoach} className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-lg font-black text-slate-950">Add {selectedDivision} Coach</h3>
            <div className="mt-3 grid gap-3">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Coach full name"
                className="rounded-xl border border-slate-300 px-3 py-2.5"
              />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                type="email"
                className="rounded-xl border border-slate-300 px-3 py-2.5"
              />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Temporary password (8+ characters)"
                type="password"
                className="rounded-xl border border-slate-300 px-3 py-2.5"
              />
              <button
                type="submit"
                disabled={busy === "create"}
                className="rounded-xl bg-slate-950 px-4 py-2.5 font-black text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy === "create" ? "Adding…" : `Add ${selectedDivision} Coach`}
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="font-black text-amber-950">Admin is also coaching?</h3>
            <p className="mt-1 text-sm text-amber-800">
              Keep the Admin role while also assigning yourself a team and draft position.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={adminCoachName}
                onChange={(event) => setAdminCoachName(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2.5"
                placeholder="Admin coach name"
              />
              <button
                type="button"
                onClick={includeCurrentAdmin}
                disabled={busy === "include-admin"}
                className="rounded-xl bg-amber-900 px-4 py-2.5 font-black text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {busy === "include-admin" ? "Adding…" : `Add Me to ${selectedDivision}`}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-950">{selectedDivision} Draft Order</h3>
              <p className="text-sm text-slate-600">
                {activeDivision === selectedDivision
                  ? `${selectedDivision} is active; saved changes will sync immediately.`
                  : `${activeDivision ?? "No division"} is active; order saves now and syncs when ${selectedDivision} is activated.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={randomizeOrder}
                disabled={!!busy || coaches.length < 2}
                className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Randomize {selectedDivision}
              </button>
              {selectedDivision === "U13" ? (
                <button
                  type="button"
                  onClick={applyPlannedU13Order}
                  disabled={!!busy || coaches.length < 2}
                  className="rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-black text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                >
                  Apply Planned U13 Order
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {coaches.map((coach, index) => (
              <div
                key={coach.id}
                className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[76px_1fr_auto] sm:items-center"
              >
                <input
                  type="number"
                  min={1}
                  value={draftOrderInput[coach.id] ?? index + 1}
                  onChange={(event) =>
                    setDraftOrderInput((previous) => ({ ...previous, [coach.id]: event.target.value }))
                  }
                  className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center font-black"
                  aria-label={`Draft order for ${coach.name ?? coach.email}`}
                />
                <div className="min-w-0">
                  <div className="truncate font-black text-slate-950">
                    {index + 1}. {coach.name ?? "Unnamed coach"}
                    {coach.role === "ADMIN" ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Admin</span>
                    ) : null}
                  </div>
                  <div className="truncate text-sm text-slate-600">{coach.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeCoach(coach)}
                  disabled={busy === coach.id}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy === coach.id ? "Removing…" : "Remove"}
                </button>
              </div>
            ))}
            {coaches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                No {selectedDivision} coaches yet.
              </div>
            ) : null}
          </div>

          {coaches.length > 0 ? (
            <button
              type="button"
              onClick={saveCustomOrder}
              disabled={!!busy || coaches.length < 2}
              className="mt-4 w-full rounded-xl bg-emerald-700 px-4 py-2.5 font-black text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy === "custom" ? "Saving…" : `Save ${selectedDivision} Custom Order`}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

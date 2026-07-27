"use client";

import { useEffect, useMemo, useState } from "react";

type AccessLevel = "ADMIN" | "BOARD" | "U11_COACH" | "U13_COACH" | "PARENT";
type Filter = "ALL" | AccessLevel;

type ManagedUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  isDraftCoach: boolean;
  coachDivision: "U11" | "U13" | null;
  coachOrder: number;
  accessLevel: AccessLevel;
  isCurrentUser: boolean;
  createdAt: string;
  updatedAt: string;
};

type Counts = {
  total: number;
  ADMIN: number;
  BOARD: number;
  U11_COACH: number;
  U13_COACH: number;
  PARENT: number;
};

type EditForm = {
  name: string;
  email: string;
  accessLevel: AccessLevel;
  password: string;
};

const EMPTY_COUNTS: Counts = {
  total: 0,
  ADMIN: 0,
  BOARD: 0,
  U11_COACH: 0,
  U13_COACH: 0,
  PARENT: 0,
};

const ACCESS_DETAILS: Record<AccessLevel, { label: string; className: string; description: string }> = {
  ADMIN: {
    label: "Admin",
    className: "border-amber-300 bg-amber-50 text-amber-900",
    description: "Full access. Protected and cannot be reassigned here.",
  },
  BOARD: {
    label: "CYS Board",
    className: "border-indigo-300 bg-indigo-50 text-indigo-900",
    description: "Can view both U11 and U13 player pools and board resources.",
  },
  U11_COACH: {
    label: "U11 Coach",
    className: "border-sky-300 bg-sky-50 text-sky-900",
    description: "Receives U11 player-pool access and joins the U11 draft order.",
  },
  U13_COACH: {
    label: "U13 Coach",
    className: "border-emerald-300 bg-emerald-50 text-emerald-900",
    description: "Receives U13 player-pool access and joins the U13 draft order.",
  },
  PARENT: {
    label: "No Draft Access",
    className: "border-slate-300 bg-slate-50 text-slate-700",
    description: "Account remains available, but has no coach or board access.",
  },
};

async function apiMessage(response: Response) {
  const json = await response.json().catch(() => ({}));
  return { json, message: json?.error ?? json?.message ?? `Request failed (${response.status})` };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function UserManagementPanel({
  onUserUpdated,
}: {
  onUserUpdated?: () => Promise<void> | void;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({ name: "", email: "", accessLevel: "PARENT", password: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const { json, message: apiError } = await apiMessage(response);
      if (!response.ok) throw new Error(apiError);
      setUsers(Array.isArray(json?.users) ? json.users : []);
      setCounts(json?.counts ?? EMPTY_COUNTS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers().catch((loadError) => setError(loadError?.message ?? "Failed to load users"));
  }, []);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (filter !== "ALL" && user.accessLevel !== filter) return false;
      if (!query) return true;
      return `${user.name ?? ""} ${user.email ?? ""}`.toLowerCase().includes(query);
    });
  }, [filter, search, users]);

  function beginEdit(user: ManagedUser) {
    setEditingId(user.id);
    setForm({
      name: user.name ?? "",
      email: user.email ?? "",
      accessLevel: user.accessLevel,
      password: "",
    });
    setError(null);
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ name: "", email: "", accessLevel: "PARENT", password: "" });
  }

  async function saveUser(user: ManagedUser) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const { json, message: apiError } = await apiMessage(response);
      if (!response.ok) throw new Error(apiError);

      await loadUsers();
      await onUserUpdated?.();
      setEditingId(null);
      setForm({ name: "", email: "", accessLevel: "PARENT", password: "" });
      setMessage(json?.message ?? "User access updated.");
    } catch (saveError: any) {
      setError(saveError?.message ?? "Failed to update user");
    } finally {
      setBusy(false);
    }
  }

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: "ALL", label: "All Users", count: counts.total },
    { id: "U11_COACH", label: "U11 Coaches", count: counts.U11_COACH },
    { id: "U13_COACH", label: "U13 Coaches", count: counts.U13_COACH },
    { id: "BOARD", label: "CYS Board", count: counts.BOARD },
    { id: "PARENT", label: "No Draft Access", count: counts.PARENT },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Returning accounts</div>
            <h2 className="mt-1 text-2xl font-black">Users & Seasonal Access</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Reuse existing logins by assigning each returning coach or board member to this season’s access level. Historical teams and picks stay untouched.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadUsers().catch((loadError) => setError(loadError?.message ?? "Failed to refresh users"))}
            disabled={loading}
            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white hover:bg-white/20 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh Users"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {filters.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-xl border p-3 text-left transition ${
                filter === item.id
                  ? "border-sky-300 bg-sky-400/20 ring-2 ring-sky-300/20"
                  : "border-white/10 bg-white/10 hover:bg-white/15"
              }`}
            >
              <div className="text-xs font-bold uppercase tracking-wide text-slate-300">{item.label}</div>
              <div className="mt-1 text-2xl font-black">{item.count}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email…"
            className="min-w-[260px] flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-slate-950 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900">
            Access changes appear after the user signs out and back in.
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div> : null}

        <div className="mt-5 space-y-3">
          {visibleUsers.map((user) => {
            const details = ACCESS_DETAILS[user.accessLevel];
            const editing = editingId === user.id;
            return (
              <article key={user.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-black text-slate-950">{user.name || "Unnamed user"}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${details.className}`}>
                        {details.label}
                      </span>
                      {user.isCurrentUser ? (
                        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-black text-white">You</span>
                      ) : null}
                      {user.isDraftCoach && user.coachOrder > 0 ? (
                        <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">
                          Draft order #{user.coachOrder}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-700">{user.email || "No email on file"}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Account created {formatDate(user.createdAt)} · {details.description}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => (editing ? cancelEdit() : beginEdit(user))}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800"
                  >
                    {editing ? "Cancel" : "Edit Account"}
                  </button>
                </div>

                {editing ? (
                  <div className="border-t border-slate-200 bg-white p-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-bold text-slate-700">
                        Full name
                        <input
                          value={form.name}
                          onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                          className="rounded-xl border border-slate-300 px-3 py-2.5 font-medium text-slate-950"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-bold text-slate-700">
                        Login email
                        <input
                          value={form.email}
                          onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
                          type="email"
                          className="rounded-xl border border-slate-300 px-3 py-2.5 font-medium text-slate-950"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-bold text-slate-700">
                        Seasonal access
                        <select
                          value={form.accessLevel}
                          disabled={user.accessLevel === "ADMIN"}
                          onChange={(event) =>
                            setForm((previous) => ({ ...previous, accessLevel: event.target.value as AccessLevel }))
                          }
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-medium text-slate-950 disabled:bg-slate-100"
                        >
                          {user.accessLevel === "ADMIN" ? <option value="ADMIN">Admin — protected</option> : null}
                          {user.accessLevel !== "ADMIN" ? (
                            <>
                              <option value="U11_COACH">U11 Coach</option>
                              <option value="U13_COACH">U13 Coach</option>
                              <option value="BOARD">CYS Board</option>
                              <option value="PARENT">No Draft Access</option>
                            </>
                          ) : null}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-sm font-bold text-slate-700">
                        New temporary password <span className="font-medium text-slate-500">(optional)</span>
                        <input
                          value={form.password}
                          onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
                          type="password"
                          placeholder="Leave blank to keep current password"
                          className="rounded-xl border border-slate-300 px-3 py-2.5 font-medium text-slate-950"
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-600">
                        Assigning a coach automatically adds them to that division’s coach roster and places them at the end of its current draft order.
                      </p>
                      <button
                        type="button"
                        onClick={() => saveUser(user)}
                        disabled={busy}
                        className="rounded-xl bg-emerald-700 px-5 py-2.5 font-black text-white hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save Account Changes"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}

          {!loading && visibleUsers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center font-semibold text-slate-500">
              No users match this filter.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

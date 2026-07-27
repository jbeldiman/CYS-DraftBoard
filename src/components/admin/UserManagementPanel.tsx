"use client";

import { useEffect, useMemo, useState } from "react";

type Filter = "ALL" | "BOARD" | "U11_COACH" | "U13_COACH" | "VIEWER" | "PARENT";

type ManagedUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  isAdminAccount: boolean;
  isBoardMember: boolean;
  coachesU11: boolean;
  coachesU13: boolean;
  isViewer: boolean;
  u11CoachOrder: number;
  u13CoachOrder: number;
  hasNoDraftAccess: boolean;
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
  VIEWER: number;
  PARENT: number;
};

type EditForm = {
  name: string;
  email: string;
  isBoardMember: boolean;
  coachesU11: boolean;
  coachesU13: boolean;
  isViewer: boolean;
  password: string;
};

const EMPTY_COUNTS: Counts = {
  total: 0,
  ADMIN: 0,
  BOARD: 0,
  U11_COACH: 0,
  U13_COACH: 0,
  VIEWER: 0,
  PARENT: 0,
};

const EMPTY_FORM: EditForm = {
  name: "",
  email: "",
  isBoardMember: false,
  coachesU11: false,
  coachesU13: false,
  isViewer: false,
  password: "",
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

function AccessBadge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${className}`}>{children}</span>;
}

function AccessOption({
  checked,
  disabled = false,
  title,
  description,
  className,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  title: string;
  description: string;
  className: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${className} ${disabled ? "cursor-not-allowed opacity-70" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <span>
        <span className="block font-black">{title}</span>
        <span className="mt-0.5 block text-xs font-semibold opacity-80">{description}</span>
      </span>
    </label>
  );
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
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
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
      if (filter === "BOARD" && !user.isBoardMember) return false;
      if (filter === "U11_COACH" && !user.coachesU11) return false;
      if (filter === "U13_COACH" && !user.coachesU13) return false;
      if (filter === "VIEWER" && !user.isViewer) return false;
      if (filter === "PARENT" && !user.hasNoDraftAccess) return false;
      if (!query) return true;
      return `${user.name ?? ""} ${user.email ?? ""}`.toLowerCase().includes(query);
    });
  }, [filter, search, users]);

  function beginEdit(user: ManagedUser) {
    setEditingId(user.id);
    setForm({
      name: user.name ?? "",
      email: user.email ?? "",
      isBoardMember: user.isBoardMember,
      coachesU11: user.coachesU11,
      coachesU13: user.coachesU13,
      isViewer: user.isViewer,
      password: "",
    });
    setError(null);
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
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
      setForm(EMPTY_FORM);
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
    { id: "VIEWER", label: "Viewers", count: counts.VIEWER },
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
              Access is additive. One person may be on the CYS Board, coach U11, and coach U13 at the same time.
              Historical teams and picks stay untouched.
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
        <p className="mt-3 text-xs font-semibold text-slate-400">
          Counts can overlap because the same person may hold multiple assignments.
        </p>
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
            Users should sign out and back in after an access change.
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div> : null}

        <div className="mt-5 space-y-3">
          {visibleUsers.map((user) => {
            const editing = editingId === user.id;
            return (
              <article key={user.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-black text-slate-950">{user.name || "Unnamed user"}</h3>
                      {user.isAdminAccount ? <AccessBadge className="border-amber-300 bg-amber-50 text-amber-900">Admin</AccessBadge> : null}
                      {user.isBoardMember ? <AccessBadge className="border-indigo-300 bg-indigo-50 text-indigo-900">CYS Board</AccessBadge> : null}
                      {user.coachesU11 ? <AccessBadge className="border-sky-300 bg-sky-50 text-sky-900">U11 Coach</AccessBadge> : null}
                      {user.coachesU13 ? <AccessBadge className="border-emerald-300 bg-emerald-50 text-emerald-900">U13 Coach</AccessBadge> : null}
                      {user.isViewer ? <AccessBadge className="border-violet-300 bg-violet-50 text-violet-900">Viewer</AccessBadge> : null}
                      {user.hasNoDraftAccess ? <AccessBadge className="border-slate-300 bg-white text-slate-600">No Draft Access</AccessBadge> : null}
                      {user.isCurrentUser ? <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-black text-white">You</span> : null}
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-700">{user.email || "No email on file"}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                      <span>Created {formatDate(user.createdAt)}</span>
                      {user.coachesU11 && user.u11CoachOrder > 0 ? <span>U11 order #{user.u11CoachOrder}</span> : null}
                      {user.coachesU13 && user.u13CoachOrder > 0 ? <span>U13 order #{user.u13CoachOrder}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => (editing ? cancelEdit() : beginEdit(user))}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800 hover:bg-slate-100"
                  >
                    {editing ? "Cancel" : "Edit Account"}
                  </button>
                </div>

                {editing ? (
                  <div className="border-t border-slate-200 bg-white p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm font-bold text-slate-700">
                        Name
                        <input
                          value={form.name}
                          onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-medium text-slate-950"
                        />
                      </label>
                      <label className="text-sm font-bold text-slate-700">
                        Login email
                        <input
                          value={form.email}
                          type="email"
                          onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
                          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-medium text-slate-950"
                        />
                      </label>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-black text-slate-950">Seasonal assignments</div>
                      <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <AccessOption
                          checked={user.isAdminAccount || form.isBoardMember}
                          disabled={user.isAdminAccount}
                          title={user.isAdminAccount ? "Admin (includes Board access)" : "CYS Board"}
                          description="View both divisions and board/admin resources."
                          className="border-indigo-200 bg-indigo-50 text-indigo-950"
                          onChange={(checked) => setForm((previous) => ({ ...previous, isBoardMember: checked }))}
                        />
                        <AccessOption
                          checked={form.coachesU11}
                          title="U11 Coach"
                          description="Join the U11 roster, player pool, and draft order."
                          className="border-sky-200 bg-sky-50 text-sky-950"
                          onChange={(checked) => setForm((previous) => ({ ...previous, coachesU11: checked }))}
                        />
                        <AccessOption
                          checked={form.coachesU13}
                          title="U13 Coach"
                          description="Join the U13 roster, player pool, and draft order."
                          className="border-emerald-200 bg-emerald-50 text-emerald-950"
                          onChange={(checked) => setForm((previous) => ({ ...previous, coachesU13: checked }))}
                        />
                        <AccessOption
                          checked={form.isViewer}
                          title="Viewer"
                          description="View the live draft and both player pools without joining a coach roster."
                          className="border-violet-200 bg-violet-50 text-violet-950"
                          onChange={(checked) => setForm((previous) => ({ ...previous, isViewer: checked }))}
                        />
                      </div>
                      {!user.isAdminAccount && !form.isBoardMember && !form.coachesU11 && !form.coachesU13 && !form.isViewer ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                          No boxes selected: this account will remain active but have no draft access.
                        </div>
                      ) : null}
                    </div>

                    <label className="mt-4 block text-sm font-bold text-slate-700">
                      New temporary password <span className="font-medium text-slate-500">(optional; leave blank to keep current password)</span>
                      <input
                        value={form.password}
                        type="password"
                        placeholder="At least 8 characters"
                        onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-medium text-slate-950"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => saveUser(user)}
                      disabled={busy}
                      className="mt-4 w-full rounded-xl bg-indigo-700 px-4 py-3 font-black text-white hover:bg-indigo-600 disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Save Account Changes"}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}

          {!loading && visibleUsers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm font-semibold text-slate-500">
              No users match this search and filter.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

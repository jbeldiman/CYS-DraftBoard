"use client";

import { useEffect, useMemo, useState } from "react";

type AccessRequest = {
  id: string;
  type: "COACH" | "BOARD";
  status: "PENDING" | "APPROVED" | "DENIED";
  requestedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    createdAt: string;
  };
};

export default function ApprovalsPage() {
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/access-requests?status=PENDING");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error ?? "Failed to load approvals");
        return;
      }
      setItems(Array.isArray(json?.items) ? json.items : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(id: string) {
    setMsg(null);
    setErr(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/access-requests/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error ?? "Failed to approve");
        return;
      }
      setMsg("Approved.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function deny(id: string) {
    setMsg(null);
    setErr(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/access-requests/${encodeURIComponent(id)}/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error ?? "Failed to deny");
        return;
      }
      setMsg("Denied.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const pending = useMemo(() => items.filter((i) => i.status === "PENDING"), [items]);

  return (
    <div className="min-h-[100svh] w-full bg-gray-50 px-4 py-8">
      <div className="mx-auto w-full max-w-4xl rounded-2xl bg-white shadow p-6">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Approvals</h1>
            <p className="text-sm text-gray-600">Approve or deny Board/Coach account requests.</p>
          </div>
          <button
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            onClick={load}
            disabled={loading || !!busyId}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {err ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
        ) : null}

        {msg ? (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {msg}
          </div>
        ) : null}

        {pending.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-gray-700">
            No pending requests.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left text-sm font-semibold text-gray-700 py-2 pr-3">Type</th>
                  <th className="text-left text-sm font-semibold text-gray-700 py-2 pr-3">Name</th>
                  <th className="text-left text-sm font-semibold text-gray-700 py-2 pr-3">Email</th>
                  <th className="text-left text-sm font-semibold text-gray-700 py-2 pr-3">Requested</th>
                  <th className="text-right text-sm font-semibold text-gray-700 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-3 pr-3 text-sm text-gray-900">{r.type}</td>
                    <td className="py-3 pr-3 text-sm text-gray-900">{r.user.name ?? "—"}</td>
                    <td className="py-3 pr-3 text-sm text-gray-900">{r.user.email}</td>
                    <td className="py-3 pr-3 text-sm text-gray-600">
                      {new Date(r.requestedAt).toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          onClick={() => approve(r.id)}
                          disabled={!!busyId}
                        >
                          {busyId === r.id ? "Working..." : "Approve"}
                        </button>
                        <button
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          onClick={() => deny(r.id)}
                          disabled={!!busyId}
                        >
                          {busyId === r.id ? "Working..." : "Deny"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 text-sm text-gray-600">
          Go to <span className="font-mono">/admin/approvals</span> to manage approvals.
        </div>
      </div>
    </div>
  );
}

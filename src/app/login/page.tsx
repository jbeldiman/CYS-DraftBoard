"use client";

import React, { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "signin" | "signup";
type AccountType = "PARENT" | "COACH" | "BOARD";

function cleanNext(next: string | null) {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("/api")) return "/";
  return next;
}

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();

  const initialMode: Mode = useMemo(() => {
    const m = (params.get("mode") || "").toLowerCase();
    return m === "signup" ? "signup" : "signin";
  }, [params]);

  const nextUrl = useMemo(() => cleanNext(params.get("next")), [params]);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [accountType, setAccountType] = useState<AccountType>("PARENT");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function doSignIn() {
    setBusy(true);
    setErr(null);
    setMsg(null);

    const res = await signIn("credentials", {
      redirect: false,
      email: email.trim().toLowerCase(),
      password,
      callbackUrl: "/",
    });

    setBusy(false);

    if (!res || res.error) {
      setErr(res?.error || "Login failed.");
      return;
    }

    router.replace(nextUrl || "/");
    router.refresh();
  }

  async function doSignUp() {
    setBusy(true);
    setErr(null);
    setMsg(null);

    const payload = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      accountType,
    };

    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => ({}));

      if (!r.ok || !data?.ok) {
        setErr(data?.error || "Failed to create account.");
        setBusy(false);
        return;
      }

      if (data?.status === "PENDING") {
        setMsg("Account created and pending approval. You will be able to log in once approved.");
        setBusy(false);
        return;
      }

      setMsg("Account created. Logging you in...");
      await doSignIn();
    } catch {
      setErr("Failed to create account.");
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (mode === "signup") return void doSignUp();
    return void doSignIn();
  }

  const canSubmit = useMemo(() => {
    const e = email.trim();
    if (!e || !password) return false;
    if (mode === "signup") {
      if (password.length < 8) return false;
      if ((accountType === "COACH" || accountType === "BOARD") && !name.trim()) return false;
    }
    return true;
  }, [mode, email, password, name, accountType]);

  return (
    <div className="min-h-[100svh] w-full flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white shadow p-6">
        <div className="flex items-center justify-between gap-2 mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>

          <button
            type="button"
            className="text-sm font-medium text-blue-600 hover:underline"
            onClick={() => {
              setErr(null);
              setMsg(null);
              setMode(mode === "signin" ? "signup" : "signin");
            }}
            disabled={busy}
          >
            {mode === "signin" ? "Create account" : "Back to sign in"}
          </button>
        </div>

        {err ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </div>
        ) : null}

        {msg ? (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {msg}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account type</label>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as AccountType)}
                  disabled={busy}
                >
                  <option value="PARENT">Parent</option>
                  <option value="COACH">Coach</option>
                  <option value="BOARD">Board</option>
                </select>
              </div>

              {(accountType === "COACH" || accountType === "BOARD") ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="First Last"
                    disabled={busy}
                    autoComplete="name"
                  />
                </div>
              ) : null}
            </>
          ) : null}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={busy}
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Password"}
              disabled={busy}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="w-full rounded-lg bg-blue-600 text-white font-semibold py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <div className="text-xs text-gray-500 text-center">
            {mode === "signin"
              ? "After signing in, you will be routed to the home page."
              : accountType === "PARENT"
              ? "Parents can create accounts and sign in immediately."
              : "Coach/Board accounts will require approval before sign in."}
          </div>
        </form>
      </div>
    </div>
  );
}

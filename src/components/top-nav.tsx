"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import UserActions from "@/components/user-actions";

type NavSession = {
  user?: {
    id?: string;
    email?: string | null;
    name?: string | null;
    role?: string | null;
  };
};

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

function RoleBadge({ role }: { role: string }) {
  if (!role) return null;

  const label =
    role === "ADMIN"
      ? "Admin"
      : role === "BOARD"
      ? "Board"
      : role === "COACH"
      ? "Coach"
      : "Parent";

  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
      {label}
    </span>
  );
}

export default function TopNav({ session }: { session: NavSession | null }) {
  const pathname = usePathname();
  const authed = !!session?.user?.id;
  const role = (session?.user?.role ?? "").toString();
  const isAdmin = role === "ADMIN";

  const baseLinks: { href: string; label: string }[] = [
    { href: "/", label: "Home" },
    { href: "/draft", label: "Draft Board" },
    { href: "/live-draft", label: "Live Draft" },
    { href: "/players", label: "Eligible Players" },
    { href: "/rosters", label: "My Roster" },
    ...(role !== "PARENT" ? [{ href: "/trade", label: "Trade Hub" }] : []),
    { href: "/siblings", label: "Siblings" },
  ];

  const links = isAdmin
    ? [...baseLinks, { href: "/admin/full-rosters", label: "Full Rosters" }, { href: "/admin", label: "Admin" }]
    : baseLinks;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/70 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-card shadow-sm">
                🏆
              </span>
              <span className="hidden sm:inline">CYS Draft Hub</span>
              <span className="sm:hidden">CYS</span>
            </Link>

            <Separator orientation="vertical" className="h-6" />

            <nav className="hidden md:flex items-center gap-1">
              {links.map((l) => {
                const active = pathname === l.href;
                const locked = !authed && l.href !== "/";
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-disabled={locked}
                    className={cx(
                      "rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      locked && "pointer-events-none opacity-50"
                    )}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <RoleBadge role={role} />
            <UserActions authed={authed} email={session?.user?.email ?? null} role={session?.user?.role ?? null} />
          </div>
        </div>

        {/* Mobile nav (scrollable tabs) */}
        <div className="md:hidden -mx-4 px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {links.map((l) => {
              const active = pathname === l.href;
              const locked = !authed && l.href !== "/";
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-disabled={locked}
                  className={cx(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs border transition-colors",
                    active ? "bg-accent text-accent-foreground border-transparent" : "bg-card hover:bg-accent",
                    locked && "pointer-events-none opacity-50"
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}

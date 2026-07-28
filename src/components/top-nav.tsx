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
    isDraftCoach?: boolean | null;
    coachDivision?: "U11" | "U13" | null;
    coachesU11?: boolean | null;
    coachesU13?: boolean | null;
    isViewer?: boolean | null;
  };
};

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

function RoleBadge({
  role,
  coachesU11,
  coachesU13,
  isViewer,
}: {
  role: string;
  coachesU11: boolean;
  coachesU13: boolean;
  isViewer: boolean;
}) {
  if (!role) return null;

  const labels: string[] = [];
  if (role === "ADMIN") labels.push("Admin");
  else if (role === "BOARD") labels.push("Board");
  if (coachesU11) labels.push("U11 Coach");
  if (coachesU13) labels.push("U13 Coach");
  if (isViewer) labels.push("Viewer");
  if (!labels.length) labels.push(role === "COACH" ? "Coach" : "Account");

  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
      {labels.join(" · ")}
    </span>
  );
}

export default function TopNav({ session }: { session: NavSession | null }) {
  const pathname = usePathname();
  const authed = !!session?.user?.id;
  const role = (session?.user?.role ?? "").toString();
  const isAdmin = role === "ADMIN";
  const isBoard = role === "BOARD";
  const isViewer = !!session?.user?.isViewer;

  const coachesU11 =
    !!session?.user?.coachesU11 ||
    (!!session?.user?.isDraftCoach && session?.user?.coachDivision === "U11");
  const coachesU13 =
    !!session?.user?.coachesU13 ||
    (!!session?.user?.isDraftCoach && session?.user?.coachDivision === "U13");

  const playerPoolLinks = [
    ...(isAdmin || isBoard || isViewer || coachesU11 ? [{ href: "/players/u11", label: "U11 Pool" }] : []),
    ...(isAdmin || isBoard || isViewer || coachesU13 ? [{ href: "/players/u13", label: "U13 Pool" }] : []),
  ];

  const hasDraftAccess = isAdmin || isBoard || coachesU11 || coachesU13 || role === "COACH";

  const viewerOnly = isViewer && !isAdmin && !isBoard && !coachesU11 && !coachesU13 && role !== "COACH";

  const baseLinks: { href: string; label: string }[] = viewerOnly
    ? [
        { href: "/", label: "Home" },
        { href: "/live-draft", label: "Live Draft" },
        ...playerPoolLinks,
      ]
    : [
        { href: "/", label: "Home" },
        { href: "/draft", label: "Draft Board" },
        { href: "/live-draft", label: "Live Draft" },
        ...playerPoolLinks,
        { href: "/rosters", label: "My Roster" },
        ...(hasDraftAccess ? [{ href: "/trade", label: "Trade Hub" }] : []),
        { href: "/siblings", label: "Siblings" },
      ];

  const links = isAdmin
    ? [...baseLinks, { href: "/admin/full-rosters", label: "All Rosters" }, { href: "/admin", label: "Admin" }]
    : baseLinks;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/70 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-card shadow-sm">🏆</span>
              <span className="hidden sm:inline">CYS Draft Hub</span>
              <span className="sm:hidden">CYS</span>
            </Link>

            <Separator orientation="vertical" className="h-6" />

            <nav className="hidden md:flex items-center gap-1">
              {links.map((l) => {
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
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
            <RoleBadge role={role} coachesU11={coachesU11} coachesU13={coachesU13} isViewer={isViewer} />
            <UserActions authed={authed} email={session?.user?.email ?? null} role={session?.user?.role ?? null} />
          </div>
        </div>

        <div className="md:hidden -mx-4 px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
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

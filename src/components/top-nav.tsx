import Link from "next/link";
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

export default function TopNav({ session }: { session: NavSession | null }) {
  const authed = !!session?.user?.id;
  const role = (session?.user?.role ?? "").toString();
  const isAdmin = role === "ADMIN";

  const baseLinks: { href: string; label: string }[] = [
    { href: "/", label: "Home" },
    { href: "/draft", label: "Draft Board" },
    { href: "/live-draft", label: "Live Draft" },
    { href: "/players", label: "Full Eligible Players" },
    { href: "/remaining-players", label: "Remaining Players" },
    { href: "/rosters", label: "My Roster" },
    { href: "/siblings", label: "Siblings" },
    { href: "/history", label: "History" },
  ];

  const links = isAdmin
    ? [...baseLinks, { href: "/admin/full-rosters", label: "Full Rosters" }, { href: "/admin", label: "Admin" }]
    : baseLinks;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-semibold tracking-tight">
              CYS Draft Hub
            </Link>
            <Separator orientation="vertical" className="h-6" />
            <nav className="flex items-center gap-1 flex-wrap">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                    !authed && l.href !== "/" ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          <UserActions authed={authed} email={session?.user?.email ?? null} role={session?.user?.role ?? null} />
        </div>
      </div>
    </header>
  );
}

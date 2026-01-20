import Link from "next/link";
import { Trophy, Users, History, Shield } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const nav = [
  { href: "/draft", label: "Draft Board", icon: Trophy },
  { href: "/siblings", label: "Siblings", icon: Users },
  { href: "/history", label: "History", icon: History },
  { href: "/admin", label: "Admin", icon: Shield },
];

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 backdrop-blur border-b bg-background/80">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">
            CYS Draft Hub
          </Link>
          <nav className="flex items-center gap-4">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 text-sm hover:opacity-80"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <Separator />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
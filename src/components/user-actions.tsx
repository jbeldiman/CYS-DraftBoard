"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function UserActions({
  authed,
  email,
  role,
}: {
  authed: boolean;
  email: string | null;
  role: string | null;
}) {
  if (!authed) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="hidden sm:flex flex-col items-end leading-tight">
        <div className="text-sm font-medium">{email ?? "Signed in"}</div>
        <div className="text-xs text-muted-foreground">{role ?? ""}</div>
      </div>

      <Button
        variant="outline"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        Sign out
      </Button>
    </div>
  );
}

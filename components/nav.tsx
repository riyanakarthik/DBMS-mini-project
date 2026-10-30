"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMe } from "@/lib/use-me";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/search", label: "Semantic vs statistical" },
  { href: "/reports", label: "Reports" },
  { href: "/watchlist", label: "Watchlist" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { me, reload } = useMe();

  // re-check who is logged in after navigation (e.g. right after login/logout)
  useEffect(() => {
    reload();
  }, [pathname, reload]);

  async function logout() {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b bg-background">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold">EquiVector</Link>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn("text-sm text-muted-foreground hover:text-foreground", pathname === l.href && "text-foreground font-medium")}
          >
            {l.label}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {me ? (
            <>
              <span className="text-muted-foreground">{me.email}</span>
              <Badge variant={me.role === "analyst" ? "default" : "secondary"}>{me.role}</Badge>
              <Button size="sm" variant="outline" onClick={logout}>Log out</Button>
            </>
          ) : (
            !["/login", "/signup"].includes(pathname) && (
              <Link href="/login" className="underline">Log in</Link>
            )
          )}
        </div>
      </nav>
    </header>
  );
}

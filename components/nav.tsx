"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/search", label: "Semantic vs statistical" },
  { href: "/reports", label: "Reports" },
  { href: "/watchlist", label: "Watchlist" },
];

export function Nav() {
  const pathname = usePathname();
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
      </nav>
    </header>
  );
}

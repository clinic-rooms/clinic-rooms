"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, DoorOpen, Users, MessageSquareText, Settings, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "לוח שיבוצים", icon: LayoutGrid },
  { href: "/admin/stats", label: "ניצולת", icon: BarChart3 },
  { href: "/admin/rooms", label: "חדרים", icon: DoorOpen },
  { href: "/admin/users", label: "צוות", icon: Users },
  { href: "/admin/chat", label: "עוזר חכם", icon: MessageSquareText },
  { href: "/admin/settings", label: "הגדרות", icon: Settings },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="grid-scroll sticky top-[49px] z-30 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium",
              active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            <l.icon size={15} />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { CalendarDays, LayoutGrid, PlusCircle, UserX, Bell, Shield, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth/client";
import { Avatar } from "@/components/ui";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TABS = [
  { href: "/", label: "הלו״ז שלי", icon: CalendarDays },
  { href: "/board", label: "לוח מלא", icon: LayoutGrid },
  { href: "/request", label: "הזמנת חדר", icon: PlusCircle },
  { href: "/absences", label: "היעדרויות", icon: UserX },
  { href: "/notifications", label: "התראות", icon: Bell },
] as const;

export function AppNav({
  clinicName,
  userName,
  userColor,
  isAdmin,
}: {
  clinicName: string;
  userName: string;
  userColor: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useSWR("/api/notifications", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
  const unread = data?.unread ?? 0;

  async function logout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card/90 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">
            {clinicName.trim().charAt(0) || "מ"}
          </span>
          <span className="font-bold">{clinicName}</span>
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/admin") && "bg-accent text-accent-foreground"
              )}
            >
              <Shield size={16} />
              ניהול
            </Link>
          )}
          {/* desktop tabs */}
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium hover:bg-muted",
                  pathname === t.href && "bg-accent text-accent-foreground"
                )}
              >
                <t.icon size={16} />
                {t.label}
                {t.href === "/notifications" && unread > 0 && (
                  <span className="absolute -top-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <button
            onClick={logout}
            title="התנתקות"
            className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted"
          >
            <Avatar name={userName} color={userColor} size={26} />
            <LogOut size={14} className="text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* bottom tab bar — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
                active ? "text-primary font-semibold" : "text-muted-foreground"
              )}
            >
              <t.icon size={20} />
              {t.label}
              {t.href === "/notifications" && unread > 0 && (
                <span className="absolute top-1 left-[calc(50%-18px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

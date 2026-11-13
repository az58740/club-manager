"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  Home,
  LogOut,
  Settings,
  Shield,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { useClub } from "@/lib/store";
import { upcomingEvents } from "@/lib/selectors";
import { localDigits } from "@/lib/date";
import { ROLE_LABELS, SPORT_LABELS } from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type { Message } from "@/lib/i18n/messages";
import { useDocumentTitle } from "@/lib/use-document-title";
import { Avatar, ClubLogo, Splash, cn } from "@/components/ui";
import { LocaleSwitch } from "@/components/locale-switch";
import { EmzaAgent } from "@/components/emza-agent";

interface NavItem {
  href: string;
  label: Message;
  icon: typeof Home;
  roles: Array<"manager" | "coach" | "player">;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: M.shell.navHome, icon: Home, roles: ["manager", "coach", "player"] },
  {
    href: "/schedule",
    label: M.shell.navSchedule,
    icon: CalendarDays,
    roles: ["manager", "coach", "player"],
  },
  { href: "/players", label: M.shell.navPlayers, icon: Users, roles: ["manager", "coach"] },
  { href: "/teams", label: M.shell.navTeams, icon: Shield, roles: ["manager", "coach", "player"] },
  { href: "/finances", label: M.shell.navFinances, icon: Wallet, roles: ["manager", "player"] },
  { href: "/users", label: M.shell.navUsers, icon: UserCog, roles: ["manager"] },
];

const TITLES: Array<[string, Message]> = [
  ["/players", M.shell.navPlayers],
  ["/teams", M.shell.navTeams],
  ["/schedule", M.shell.titleSchedule],
  ["/finances/ledger", M.shell.titleLedger],
  ["/finances/accounts", M.shell.titleAccounts],
  ["/finances/shop", M.shell.titleShop],
  ["/finances", M.shell.titleFinances],
  ["/users", M.shell.titleUsers],
  ["/settings", M.shell.titleSettings],
];

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, currentUser, role, isManager, isPlayer, isCoach, logout, data } = useClub();
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const pageTitle = (path: string) =>
    t(TITLES.find(([prefix]) => (prefix === "/" ? path === "/" : path.startsWith(prefix)))?.[1] ??
      M.shell.titleDashboard);

  useEffect(() => {
    if (!ready) return;
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    if (isCoach && pathname.startsWith("/finances")) {
      router.replace("/");
      return;
    }
    if (isPlayer && pathname.startsWith("/finances/")) {
      router.replace("/finances");
      return;
    }
    if (!isManager && pathname.startsWith("/users")) {
      router.replace("/");
      return;
    }
    if (isPlayer && pathname === "/players") {
      const ownId = currentUser.playerId ?? "";
      if (new URLSearchParams(window.location.search).get("id") !== ownId) {
        router.replace(`/players?id=${ownId}`);
      }
    }
  }, [ready, currentUser, isManager, isCoach, isPlayer, pathname, router]);

  useDocumentTitle(ready ? `${pageTitle(pathname)} | ${data.club.name}` : null);

  if (!ready || !currentUser) return <Splash />;

  const navItems = NAV_ITEMS.filter((item) => (role ? item.roles.includes(role) : false));
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const freshEvents = upcomingEvents(data).filter(
    (event) => new Date(event.startsAt) <= weekAhead,
  ).length;

  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      <aside className="hidden shrink-0 border-e border-line/70 bg-white/85 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[280px] lg:flex-col lg:px-5 lg:py-6">
        <Link href="/" className="flex items-center gap-3 px-1">
          <ClubLogo logo={data.club.logo} className="h-11 w-11 rounded-2xl" />
          <span className="space-y-0.5">
            <span className="block text-[15px] font-extrabold tracking-tight text-ink">
              {data.club.name}
            </span>
            <span className="block text-[11px] text-muted">
              {t(M.shell.clubTagline, { sport: SPORT_LABELS[data.club.sport] })}
            </span>
          </span>
        </Link>

        <nav className="mt-8 flex flex-col gap-1">
          {navItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium transition",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-soft hover:bg-slate-50 hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-xl transition",
                    active
                      ? "bg-white text-brand-600 shadow-sm"
                      : "bg-slate-50 text-muted group-hover:bg-white",
                  )}
                >
                  <Icon className="h-4.5 w-4.5" strokeWidth={active ? 2.3 : 1.9} />
                </span>
                {t(item.label)}
                {active ? (
                  <span className="ms-auto h-1.5 w-1.5 rounded-full bg-brand-500" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <LocaleSwitch />

          <div className="rounded-2xl bg-gradient-to-br from-night-900 to-brand-900 p-4 text-white">
            <p className="text-[11px] text-white/60">{t(M.shell.currentSeason)}</p>
            <p className="mt-1 text-sm font-bold">{localDigits(data.club.season)}</p>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {t(M.shell.activeTeams, { count: data.teams.length })}
            </div>
          </div>

          <div className="rounded-2xl border border-line/80 p-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={currentUser.name} src={currentUser.photo} size="sm" ring={false} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">{currentUser.name}</p>
                <p className="text-[11px] text-muted">{ROLE_LABELS[currentUser.role]}</p>
              </div>
              <Link
                href="/settings"
                className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-slate-100 hover:text-ink"
                aria-label={t(M.shell.titleSettings)}
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
            <button
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-[12px] font-medium text-muted transition hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t(M.shell.signOut)}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/85 pt-safe backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <ClubLogo
                logo={data.club.logo}
                className="h-8 w-8 rounded-xl [&>svg]:h-5 [&>svg]:w-5"
              />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold leading-tight text-ink">
                  {pageTitle(pathname)}
                </p>
                <p className="truncate text-[10px] text-muted">{data.club.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <LocaleSwitch compact />
              <Link
                href="/schedule"
                className="relative grid h-9 w-9 place-items-center rounded-xl text-ink-soft transition hover:bg-slate-100"
                aria-label={t(M.shell.upcomingEvents)}
              >
                <Bell className="h-4.5 w-4.5" />
                {freshEvents > 0 ? (
                  <span className="absolute start-2 top-2 h-1.5 w-1.5 rounded-full bg-accent-500 ring-2 ring-canvas" />
                ) : null}
              </Link>
              <Link href="/settings" aria-label={t(M.shell.titleSettings)} className="rounded-full">
                <Avatar
                  name={currentUser.name}
                  src={currentUser.photo}
                  size="sm"
                  className="h-8 w-8 text-[11px]"
                />
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-white/95 pb-safe backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition",
                  active ? "text-brand-700" : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-12 place-items-center rounded-xl transition-all",
                    active ? "bg-brand-50" : "",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                </span>
                {t(item.label)}
              </Link>
            );
          })}
        </div>
      </nav>

      <EmzaAgent />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  Clock,
  MapPin,
  ReceiptText,
  TrendingUp,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useClub } from "@/lib/store";
import { allLedgerEntries, entriesInMonth, ledgerTotals } from "@/lib/finance";
import {
  activePlayers,
  attendanceBreakdown,
  debtorBreakdown,
  eventAttendance,
  invoicePaidAmount,
  playerAttendance,
  playerById,
  playerDebt,
  playerStats,
  teamById,
  topScorers,
  totalOutstanding,
  upcomingEvents,
} from "@/lib/selectors";
import { addJalaliMonths, formatDay, formatMonthYear, formatTime, localDigits, shortDayNumber, shortMonthName, timeUntil } from "@/lib/date";
import { compactToman, faNum, percent, toman } from "@/lib/format";
import { EVENT_TYPE_LABELS, ROLE_LABELS, STAT_LABELS, TEAM_THEME } from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import { Avatar, Badge, Card, ClubLogo, Progress, Select, buttonStyles, cn } from "@/components/ui";

export default function DashboardPage() {
  const { data, currentUser, role, isManager, isPlayer } = useClub();
  const t = useT();
  const [reportMonthOffset, setReportMonthOffset] = useState(0);
  const now = new Date();
  const reportMonths = Array.from({ length: 12 }, (_, index) => {
    const offset = -index;
    const start = addJalaliMonths(now, offset);
    return { offset, start, label: formatMonthYear(start) };
  });
  const reportMonth = addJalaliMonths(now, reportMonthOffset);
  const reportTotals = useMemo(() => {
    const entries = entriesInMonth(allLedgerEntries(data), reportMonth);
    return ledgerTotals(entries);
  }, [data, reportMonth]);
  const debtors = useMemo(() => debtorBreakdown(data), [data]);
  const statLabels = STAT_LABELS[data.club.sport];

  const me = currentUser?.playerId ? playerById(data, currentUser.playerId) : undefined;
  const myTeam = me ? teamById(data, me.teamId) : undefined;

  const feed = upcomingEvents(data).filter((event) =>
    isPlayer && myTeam ? event.teamId === myTeam.id : true,
  );
  const next = feed[0] ?? null;
  const nextTeam = next ? teamById(data, next.teamId) : undefined;

  const recentTrainings = data.events
    .filter((event) => event.type === "training" && event.status === "done")
    .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt))
    .slice(0, 5);

  const attendanceRecords = recentTrainings
    .flatMap((event) => eventAttendance(data, event.id))
    .filter((record) => (isPlayer && me ? record.playerId === me.id : true));
  const attendanceRate = attendanceBreakdown(attendanceRecords).attendanceRate;

  const currentPeriod = formatMonthYear(now);
  const periodInvoices = data.invoices.filter((invoice) => invoice.period === currentPeriod);
  const periodTotal = periodInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const periodPaid = periodInvoices.reduce(
    (sum, invoice) => sum + invoicePaidAmount(invoice, data),
    0,
  );
  const collectRate = periodTotal ? (periodPaid / periodTotal) * 100 : 0;
  const outstanding = totalOutstanding(data);
  const debtorCount = debtors.length;
  const myDebt = me ? playerDebt(me.id, data) : 0;
  const myStats = me ? playerStats(data, me.id) : null;
  const myAttendance = me ? playerAttendance(data, me.id) : null;

  const last30Revenue = data.payments
    .filter((payment) => +new Date(payment.paidAt) >= now.getTime() - 30 * 864e5)
    .reduce((sum, payment) => sum + payment.amount, 0);

  const leaders = topScorers(data, 4);
  const activeCount = activePlayers(data).length;
  const nextThree = feed.slice(0, 3);
  const matchesPlayed = data.events.filter(
    (event) => event.type === "match" && event.sets?.length,
  ).length;

  const quickActions = isPlayer
    ? [
        { href: "/schedule", label: M.dashboard.mySchedule, icon: CalendarDays },
        { href: `/players?id=${me?.id ?? ""}`, label: M.dashboard.myProfile, icon: UserCheck },
        { href: "/finances", label: M.dashboard.myTuition, icon: Wallet },
        { href: "/teams", label: M.dashboard.myTeam, icon: Users },
      ]
    : [
        { href: "/schedule", label: M.dashboard.takeAttendance, icon: UserCheck },
        { href: "/players?new=1", label: M.dashboard.newPlayer, icon: UserPlus },
        { href: "/schedule?new=1", label: M.dashboard.newEvent, icon: CalendarPlus },
        { href: "/finances", label: M.dashboard.recordPayment, icon: Wallet },
        ...(isManager
          ? [{ href: "/finances/ledger?new=expense", label: M.ledger.recordExpense, icon: ArrowUpRight }]
          : []),
      ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] text-muted">{formatDay(now)}</p>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-tight text-ink sm:text-3xl">
            {t(M.dashboard.greeting, { name: currentUser?.name.split(" ")[0] ?? "" })}
          </h1>
          <p className="mt-1 text-[12px] text-muted">
            {role ? ROLE_LABELS[role] : ""} · {data.club.name}
          </p>
        </div>
        <span className="hidden items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-ink-soft ring-1 ring-line sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {t(M.dashboard.seasonChip, { season: localDigits(data.club.season) })}
        </span>
      </div>

      {/* next event hero */}
      <section className="relative overflow-hidden rounded-[28px] bg-night-900 text-white shadow-[0_30px_60px_-40px_rgba(10,19,41,0.9)]">
        <div className="absolute inset-0 court-lines" />
        <div className="absolute inset-0 court-grid opacity-[0.15]" />
        <div className="absolute -start-16 -top-20 h-56 w-56 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="absolute -bottom-24 end-10 h-52 w-52 rounded-full bg-emerald-500/20 blur-3xl" />
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="pointer-events-none absolute -start-8 top-1/2 hidden h-52 w-52 -translate-y-1/2 text-white/[0.07] sm:block"
        >
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M50 4c-16 18-21 37-15 58" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 42c26-4 47 5 62 24" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M96 42c-26-4-47 5-62 24" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>

        <div className="relative p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/85 ring-1 ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
              {next ? t(M.dashboard.nextUp, { type: EVENT_TYPE_LABELS[next.type] }) : t(M.dashboard.noUpcomingChip)}
            </span>
            {next ? (
              <span className="rounded-full bg-accent-500/15 px-2.5 py-1 text-[11px] font-medium text-accent-400 ring-1 ring-accent-500/25">
                {timeUntil(next.startsAt) ?? t(M.dashboard.inProgress)}
              </span>
            ) : null}
          </div>

          {next ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-extrabold leading-snug sm:text-2xl">{next.title}</h2>
                {next.opponent ? (
                  <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[11px] text-white/75">
                    {t(M.dashboard.versus, { opponent: next.opponent })}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-white/65">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDay(next.startsAt)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTime(next.startsAt)} · {t(M.dashboard.minutes, { count: faNum(next.durationMin) })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {next.location}
                </span>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Link
                  href={`/schedule?id=${next.id}`}
                  className={buttonStyles(
                    "accent",
                    "md",
                    "bg-white text-night-900 shadow-none hover:bg-white/90",
                  )}
                >
                  {t(
                    next.type === "training"
                      ? isPlayer
                        ? M.dashboard.practiceDetails
                        : M.dashboard.takeAttendance
                      : M.dashboard.matchDetails,
                  )}
                  <ArrowLeft className="h-4 w-4 ltr:rotate-180" />
                </Link>
                <Link
                  href="/schedule"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-medium text-white/85 ring-1 ring-white/15 transition hover:bg-white/15"
                >
                  {t(M.dashboard.fullCalendar)}
                </Link>
                {nextTeam ? (
                  <span className="ms-auto hidden items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/70 ring-1 ring-white/10 sm:inline-flex">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        TEAM_THEME[nextTeam.color].dot,
                      )}
                    />
                    {t(M.dashboard.teamOf, { name: nextTeam.name })}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <div className="mt-4">
              <h2 className="text-xl font-extrabold">{t(M.dashboard.noEventsTitle)}</h2>
              <p className="mt-1 text-[12px] text-white/60">{t(M.dashboard.noEventsBody)}</p>
              <Link
                href="/schedule?new=1"
                className={buttonStyles("accent", "md", "mt-5 bg-white text-night-900 shadow-none")}
              >
                <CalendarPlus className="h-4 w-4" />
                {t(M.dashboard.newEvent)}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {isPlayer ? (
          <>
            <KpiCard
              label={t(M.dashboard.myPoints, { label: statLabels.total })}
              value={faNum(myStats?.points ?? 0)}
              hint={t(M.dashboard.inMatches, { count: faNum(myStats?.matches ?? 0) })}
              icon={<Trophy className="h-4 w-4" />}
              tone="amber"
            />
            <KpiCard
              label={t(M.dashboard.attendanceRate)}
              value={percent(myAttendance?.rate ?? 0)}
              hint={t(M.dashboard.sessionsPresent, { count: faNum(myAttendance?.present ?? 0) })}
              icon={<UserCheck className="h-4 w-4" />}
              tone="emerald"
            />
            <KpiCard
              label={t(M.dashboard.tuitionBalance)}
              value={compactToman(myDebt)}
              unit={t(M.common.tomanUnit)}
              hint={t(myDebt ? M.dashboard.needsSettlement : M.dashboard.settled)}
              icon={<Wallet className="h-4 w-4" />}
              tone={myDebt ? "rose" : "emerald"}
            />
            <KpiCard
              label={t(M.dashboard.upcomingLabel)}
              value={faNum(feed.length)}
              hint={t(M.dashboard.myTeamEvents)}
              icon={<CalendarDays className="h-4 w-4" />}
              tone="brand"
            />
          </>
        ) : (
          <>
            <KpiCard
              label={t(M.dashboard.activePlayers)}
              value={faNum(activeCount)}
              hint={t(M.dashboard.inTeams, { count: faNum(data.teams.length) })}
              icon={<Users className="h-4 w-4" />}
              tone="brand"
            />
            <KpiCard
              label={t(M.dashboard.attendanceRate)}
              value={percent(attendanceRate)}
              hint={t(M.dashboard.lastFivePractices)}
              icon={<UserCheck className="h-4 w-4" />}
              tone="emerald"
            />
            {isManager ? (
              <>
                <KpiCard
                  label={t(M.dashboard.outstanding)}
                  value={compactToman(outstanding)}
                  unit={t(M.common.tomanUnit)}
                  hint={t(M.dashboard.debtorsCount, { count: faNum(debtorCount) })}
                  icon={<Wallet className="h-4 w-4" />}
                  tone={outstanding ? "amber" : "emerald"}
                />
                <KpiCard
                  label={t(M.dashboard.revenue30)}
                  value={compactToman(last30Revenue)}
                  unit={t(M.common.tomanUnit)}
                  hint={t(M.dashboard.periodCollection, { rate: percent(collectRate) })}
                  icon={<TrendingUp className="h-4 w-4" />}
                  tone="violet"
                />
              </>
            ) : (
              <>
                <KpiCard
                  label={t(M.dashboard.upcomingEvents)}
                  value={faNum(feed.length)}
                  hint={t(M.dashboard.practicesAndMatches)}
                  icon={<CalendarDays className="h-4 w-4" />}
                  tone="brand"
                />
                <KpiCard
                  label={t(M.dashboard.recordedMatches)}
                  value={faNum(matchesPlayed)}
                  hint={t(M.dashboard.inTeams, { count: faNum(data.teams.length) })}
                  icon={<Trophy className="h-4 w-4" />}
                  tone="amber"
                />
              </>
            )}
          </>
        )}
      </section>

      {/* quick actions */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {quickActions.map((action) => (
          <Link
            key={t(action.label)}
            href={action.href}
            className="group flex items-center gap-2.5 rounded-2xl bg-white p-3 ring-1 ring-line/80 transition hover:ring-brand-200"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 text-ink-soft transition group-hover:bg-brand-50 group-hover:text-brand-600">
              <action.icon className="h-4 w-4" />
            </span>
            <span className="text-[12px] font-medium text-ink">{t(action.label)}</span>
            <ChevronLeft className="ms-auto h-3.5 w-3.5 text-muted/60 transition group-hover:text-brand-500 ltr:rotate-180" />
          </Link>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        {/* upcoming */}
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h2 className="text-[15px] font-bold text-ink">{t(M.dashboard.upcomingLabel)}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{t(M.dashboard.upcomingSub)}</p>
            </div>
            <Link
              href="/schedule"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700"
            >
              {t(M.dashboard.seeAll)}
              <ChevronLeft className="h-3.5 w-3.5 ltr:rotate-180" />
            </Link>
          </div>

          <div className="mt-3 divide-y divide-line/70">
            {nextThree.map((event) => {
              const team = teamById(data, event.teamId);
              return (
                <Link
                  key={event.id}
                  href={`/schedule?id=${event.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50/70"
                >
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-line/80">
                    <span className="text-[15px] font-extrabold leading-none text-ink">
                      {shortDayNumber(event.startsAt)}
                    </span>
                    <span className="mt-0.5 text-[9px] text-muted">
                      {shortMonthName(event.startsAt)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          event.type === "match" ? "bg-rose-500" : "bg-brand-500",
                        )}
                      />
                      <p className="truncate text-[13px] font-semibold text-ink">{event.title}</p>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {formatTime(event.startsAt)} · {team?.name ?? ""}
                      {event.opponent ? ` · ${t(M.dashboard.versus, { opponent: event.opponent })}` : ""}
                    </p>
                  </div>
                  <Badge tone={event.type === "match" ? "rose" : "brand"} className="hidden sm:inline-flex">
                    {EVENT_TYPE_LABELS[event.type]}
                  </Badge>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted/60 ltr:rotate-180" />
                </Link>
              );
            })}
            {!nextThree.length ? (
              <div className="px-5 py-10 text-center text-[12px] text-muted">
                {t(M.dashboard.nothingToShow)}
              </div>
            ) : null}
          </div>
        </Card>

        <div className="space-y-4 lg:space-y-5">
          {/* leaders or personal stats */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
                <Trophy className="h-4 w-4 text-accent-500" />
                {t(isPlayer ? M.dashboard.myStats : M.dashboard.topPerformers)}
              </h2>
              {!isPlayer ? (
                <Link href="/players" className="text-[11px] font-medium text-brand-600">
                  {t(M.dashboard.allPlayers)}
                </Link>
              ) : null}
            </div>

            {isPlayer && myStats ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: statLabels.serve, value: myStats.serve },
                  { label: statLabels.attack, value: myStats.attack },
                  { label: statLabels.block, value: myStats.block },
                  { label: statLabels.digs, value: myStats.digs },
                  { label: statLabels.errors, value: myStats.errors },
                  { label: statLabels.total, value: myStats.points },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-slate-50 px-2 py-2.5 text-center">
                    <p className="text-[15px] font-extrabold text-ink">{faNum(item.value)}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{item.label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-1">
                {leaders.map((row, index) => (
                  <Link
                    key={row.player.id}
                    href={`/players?id=${row.player.id}`}
                    className="flex items-center gap-2.5 rounded-xl px-1 py-2 transition hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold",
                        index === 0
                          ? "bg-accent-500/15 text-accent-600"
                          : "bg-slate-100 text-muted",
                      )}
                    >
                      {faNum(index + 1)}
                    </span>
                    <Avatar name={row.player.fullName} size="xs" ring={false} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-ink">
                        {row.player.fullName}
                      </p>
                      <p className="text-[10px] text-muted">
                        {teamById(data, row.player.teamId)?.name ?? ""}
                      </p>
                    </div>
                    <span className="text-[13px] font-extrabold text-brand-700">
                      {faNum(row.stats.points)}
                    </span>
                  </Link>
                ))}
                {!leaders.length ? (
                  <p className="py-6 text-center text-[12px] text-muted">{t(M.dashboard.noStats)}</p>
                ) : null}
              </div>
            )}
          </Card>

          {/* finance */}
          {isManager || isPlayer ? (
          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-ink">
                  {t(isPlayer ? M.dashboard.myTuition : M.dashboard.tuitionCollection)}
                </h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  {isPlayer
                    ? t(M.dashboard.currentPeriodStatus)
                    : t(M.dashboard.periodOf, { period: currentPeriod })}
                </p>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600">
                <Wallet className="h-4 w-4" />
              </span>
            </div>

            {isPlayer ? (
              <>
                <p className="mt-4 text-2xl font-extrabold text-ink">{toman(myDebt)}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {t(myDebt ? M.dashboard.balanceAllPeriods : M.dashboard.allTuitionSettled)}
                </p>
                <Link
                  href="/finances"
                  className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-brand-600"
                >
                  {t(M.dashboard.viewInvoices)}
                  <ArrowLeft className="h-3.5 w-3.5 ltr:rotate-180" />
                </Link>
              </>
            ) : (
              <>
                <div className="mt-4 flex items-end justify-between">
                  <p className="text-2xl font-extrabold text-ink">{percent(collectRate)}</p>
                  <p className="text-[11px] text-muted">
                    {t(M.dashboard.paidOfTotal, {
                      paid: compactToman(periodPaid),
                      total: compactToman(periodTotal),
                    })}
                  </p>
                </div>
                <Progress value={collectRate} className="mt-2.5" tone="bg-violet-500" />
                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-muted">{t(M.dashboard.totalOverdue)}</p>
                    <p className="mt-1 font-bold text-ink">{toman(outstanding)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-muted">{t(M.dashboard.debtors)}</p>
                  <p className="mt-1 font-bold text-ink">{t(M.dashboard.playersCount, { count: faNum(debtorCount) })}</p>
                  </div>
                </div>
                <Link
                  href="/finances"
                  className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-brand-600"
                >
                  {t(M.dashboard.manageFinances)}
                  <ArrowLeft className="h-3.5 w-3.5 ltr:rotate-180" />
                </Link>
              </>
            )}
          </Card>
          ) : null}
        </div>
      </div>

      {isManager ? (
        <section className="grid gap-4 lg:grid-cols-2 lg:gap-5" aria-label={t(M.dashboard.managerReports)}>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-ink">{t(M.dashboard.monthlyReport)}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t(M.dashboard.monthlyReportHint)}</p>
              </div>
              <label className="w-40">
                <span className="sr-only">{t(M.dashboard.reportMonth)}</span>
                <Select
                  value={String(reportMonthOffset)}
                  onChange={(event) => setReportMonthOffset(Number(event.target.value))}
                  aria-label={t(M.dashboard.reportMonth)}
                >
                  {reportMonths.map((month) => (
                    <option key={month.offset} value={month.offset}>{month.label}</option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="text-[10px] text-emerald-700">{t(M.dashboard.monthIncome)}</p>
                <p className="mt-1 break-words text-[13px] font-extrabold text-emerald-800">{compactToman(reportTotals.income)}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 p-3">
                <p className="text-[10px] text-rose-700">{t(M.dashboard.monthExpenses)}</p>
                <p className="mt-1 break-words text-[13px] font-extrabold text-rose-800">{compactToman(reportTotals.expense)}</p>
              </div>
              <div className="rounded-2xl bg-brand-50 p-3">
                <p className="text-[10px] text-brand-700">{t(M.dashboard.monthNet)}</p>
                <p className="mt-1 break-words text-[13px] font-extrabold text-brand-800">{compactToman(reportTotals.net)}</p>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-muted">{t(M.dashboard.monthlyReportLedgerBasis)}</p>
            <Link href="/finances/ledger" className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-brand-600">
              {t(M.dashboard.openLedger)} <ChevronLeft className="h-3.5 w-3.5 ltr:rotate-180" />
            </Link>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-5 pt-5">
              <div>
                <h2 className="text-[15px] font-bold text-ink">{t(M.dashboard.debtorsList)}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t(M.dashboard.debtorsListHint, { count: faNum(debtorCount) })}</p>
              </div>
              <Badge tone={debtorCount ? "rose" : "emerald"}>{faNum(debtorCount)}</Badge>
            </div>
            <div className="mt-3 max-h-[26rem] divide-y divide-line/70 overflow-y-auto">
              {debtors.map(({ player, tuition, shop, total }) => (
                <Link
                  key={player.id}
                  href={`/players?id=${player.id}`}
                  className="flex items-center gap-2.5 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5"
                >
                  <Avatar name={player.fullName} size="sm" ring={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-ink">{player.fullName}</p>
                    <p className="truncate text-[10px] text-muted">
                      {data.teams.find((team) => team.id === player.teamId)?.name ?? t(M.finance.noTeam)}
                      {tuition > 0 ? ` · ${t(M.finance.tuitionWord)} ${compactToman(tuition)}` : ""}
                      {shop > 0 ? ` · ${t(M.finance.shopWord)} ${compactToman(shop)}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-[11px] font-bold text-rose-600">{toman(total)}</p>
                </Link>
              ))}
              {!debtorCount ? (
                <p className="px-5 py-8 text-center text-[11px] text-muted">{t(M.dashboard.noDebtors)}</p>
              ) : null}
            </div>
            {debtorCount ? (
              <Link href="/finances" className="flex items-center justify-center gap-1 border-t border-line px-4 py-3 text-[11px] font-medium text-brand-600">
                {t(M.dashboard.openDebtorReport)} <ChevronLeft className="h-3.5 w-3.5 ltr:rotate-180" />
              </Link>
            ) : null}
          </Card>
        </section>
      ) : null}

      <div className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-3 text-[10px] text-muted ring-1 ring-line/60 sm:hidden">
        <span className="flex items-center gap-1.5">
          <ClubLogo
            logo={data.club.logo}
            className="h-5 w-5 rounded-md [&>svg]:h-3.5 [&>svg]:w-3.5"
          />
          {data.club.name}
        </span>
        <span>{t(M.dashboard.seasonChip, { season: localDigits(data.club.season) })}</span>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  tone,
  unit,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: "brand" | "emerald" | "amber" | "violet" | "rose";
  unit?: string;
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <Card className="p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium text-muted sm:text-[12px]">{label}</p>
        <span
          className={cn(
            "grid h-7 w-7 place-items-center rounded-lg sm:h-8 sm:w-8 sm:rounded-xl",
            tones[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-[19px] font-extrabold tracking-tight text-ink sm:text-2xl">
        {value}
        {unit ? <span className="ms-1 text-[10px] font-medium text-muted">{unit}</span> : null}
      </p>
      <p className="mt-1 text-[10px] text-muted sm:text-[11px]">{hint}</p>
    </Card>
  );
}

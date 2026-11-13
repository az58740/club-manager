"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  MapPin,
  Pencil,
  Plus,
  Shield,
  ShieldX,
} from "lucide-react";
import { useClub } from "@/lib/store";
import {
  playersOfTeam,
  teamRecord,
  teamSummary,
  upcomingEvents,
} from "@/lib/selectors";
import { POSITION_LABELS, PLAYER_STATUS_LABELS, SPORT_POSITIONS, TEAM_THEME } from "@/lib/labels";
import { formatDay, formatTime, localDigits, shortDayNumber, shortMonthName } from "@/lib/date";
import { faNum, percent } from "@/lib/format";
import { M, type Message, useT } from "@/lib/i18n/messages";
import { Avatar, Badge, Button, Card, EmptyState, Progress, cn } from "@/components/ui";
import { PlayerFormSheet } from "@/components/player-form";
import { EventFormSheet } from "@/components/event-form";
import { TeamFormSheet } from "@/components/team-form";

export default function TeamDetailPage({ recordId }: { recordId: string }) {
  const id = recordId;
  const { data, isManager, isCoach } = useClub();
  const t = useT();
  const [addOpen, setAddOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const team = data.teams.find((row) => row.id === id);

  if (!team) {
    return (
      <EmptyState
        className="mt-6"
        icon={<ShieldX className="h-5 w-5" />}
        title={t(M.teams.notFound)}
        description={t(M.teams.notFoundDesc)}
        action={
          <Link href="/teams">
            <Button variant="soft" size="sm">
              {t(M.teams.backToTeams)}
            </Button>
          </Link>
        }
      />
    );
  }

  const canEdit = isManager || isCoach;
  const theme = TEAM_THEME[team.color];
  const roster = playersOfTeam(data, team.id);
  const record = teamRecord(data, team.id);
  const summary = teamSummary(data, team);
  const events = upcomingEvents(data).filter((event) => event.teamId === team.id).slice(0, 4);

  const headline: Array<{ label: Message; value: string; tone?: string }> = [
    { label: M.common.played, value: faNum(record.played) },
    { label: M.common.win, value: faNum(record.wins), tone: "text-emerald-600" },
    { label: M.common.loss, value: faNum(record.losses), tone: "text-rose-500" },
    { label: M.common.present, value: percent(summary.attendanceRate) },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href="/teams"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted transition hover:text-ink"
        >
          <ArrowRight className="h-4 w-4 ltr:rotate-180" />
          {t(M.shell.navTeams)}
        </Link>
        <div className="flex items-center gap-2">
          {isManager ? (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t(M.teams.editTeam)}
            </Button>
          ) : null}
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setEventOpen(true)}>
              <CalendarDays className="h-3.5 w-3.5" />
              {t(M.dashboard.newEvent)}
            </Button>
          ) : null}
        </div>
      </div>

      <section className="overflow-hidden rounded-[28px] bg-white ring-1 ring-line/80">
        <div className={cn("relative overflow-hidden bg-gradient-to-br p-5 text-white sm:p-6", theme.gradient)}>
          <div className="absolute inset-0 court-lines" />
          <div className="absolute inset-0 court-grid opacity-[0.1]" />
          <span className="pointer-events-none absolute -top-8 -end-4 select-none text-[120px] font-black leading-none text-white/10">
            {team.name.slice(0, 1)}
          </span>

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] ring-1 ring-white/20">
                {team.ageGroup} · {t(M.dashboard.seasonChip, { season: localDigits(team.season) })}
              </span>
              <h1 className="mt-3 text-2xl font-black tracking-tight">
                {t(M.dashboard.teamOf, { name: team.name })}
              </h1>
              <p className="mt-1 text-[12px] text-white/70">
                {t(M.teams.coachAndRoster, { coach: team.coach, count: faNum(roster.length) })}
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Shield className="h-6 w-6" />
            </span>
          </div>

          <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/70">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {team.homeVenue}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {t(M.teams.upcomingCount, { count: faNum(events.length) })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 divide-x divide-line/70 rtl:divide-x-reverse">
          {headline.map((item) => (
            <div key={item.label.fa} className="px-2 py-3.5 text-center">
              <p className={cn("text-base font-extrabold sm:text-lg", item.tone ?? "text-ink")}>
                {item.value}
              </p>
              <p className="mt-0.5 text-[9px] text-muted sm:text-[10px]">{t(item.label)}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h2 className="text-[15px] font-bold text-ink">{t(M.teams.rosterTitle)}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{t(M.teams.byPosition)}</p>
            </div>
            {canEdit ? (
              <Button size="sm" variant="soft" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t(M.form.add)}
              </Button>
            ) : null}
          </div>

          <div className="mt-2 space-y-4 px-5 pb-5 pt-2">
            {SPORT_POSITIONS[data.club.sport].map((position) => {
              const group = roster
                .filter((player) => player.position === position)
                .sort((a, b) => a.jersey - b.jersey);
              if (!group.length) return null;
              return (
                <div key={position}>
                  <p className="mb-1.5 text-[10px] font-semibold text-muted">
                    {POSITION_LABELS[position]} · {faNum(group.length)}
                  </p>
                  <div className="divide-y divide-line/60 overflow-hidden rounded-2xl bg-slate-50/60">
                    {group.map((player) => (
                      <Link
                        key={player.id}
                        href={`/players?id=${player.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-white"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-[11px] font-bold text-ink-soft ring-1 ring-line">
                          {faNum(player.jersey)}
                        </span>
                        <Avatar name={player.fullName} size="xs" ring={false} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-ink">
                            {player.fullName}
                          </p>
                          <p className="text-[10px] text-muted">{POSITION_LABELS[player.position]}</p>
                        </div>
                        {player.status !== "active" ? (
                          <Badge tone={player.status === "injured" ? "amber" : "slate"}>
                            {PLAYER_STATUS_LABELS[player.status]}
                          </Badge>
                        ) : null}
                        <ChevronLeft className="h-3.5 w-3.5 text-muted/50 ltr:rotate-180" />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
            {!roster.length ? (
              <p className="py-8 text-center text-[12px] text-muted">{t(M.teams.emptyRoster)}</p>
            ) : null}

            <div>
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>{t(M.teams.teamAttendanceAvg)}</span>
                <span className="font-semibold text-ink">{percent(summary.attendanceRate)}</span>
              </div>
              <Progress value={summary.attendanceRate} className="mt-1.5 h-1.5" tone="bg-emerald-500" />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-[15px] font-bold text-ink">{t(M.dashboard.upcomingLabel)}</h2>
            <Link href="/schedule" className="text-[11px] font-medium text-brand-600">
              {t(M.form.all)}
            </Link>
          </div>
          <div className="mt-2 divide-y divide-line/70">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/schedule?id=${event.id}`}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50/70"
              >
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-50 ring-1 ring-line/80">
                  <span className="text-[13px] font-extrabold leading-none text-ink">
                    {shortDayNumber(event.startsAt)}
                  </span>
                  <span className="mt-0.5 text-[8px] text-muted">{shortMonthName(event.startsAt)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-ink">{event.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {formatDay(event.startsAt)} · {formatTime(event.startsAt)}
                  </p>
                </div>
                <ChevronLeft className="h-3.5 w-3.5 text-muted/50 ltr:rotate-180" />
              </Link>
            ))}
            {!events.length ? (
              <p className="px-4 py-8 text-center text-[11px] text-muted">{t(M.teams.noEventsYet)}</p>
            ) : null}
          </div>
        </Card>
      </div>

      <PlayerFormSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultTeamId={team.id}
      />
      <EventFormSheet
        open={eventOpen}
        onClose={() => setEventOpen(false)}
        defaultTeamId={team.id}
      />
      <TeamFormSheet open={editOpen} onClose={() => setEditOpen(false)} team={team} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, ChevronLeft, Plus, Shield, Users } from "lucide-react";
import { useClub } from "@/lib/store";
import { teamSummary } from "@/lib/selectors";
import { formatDay, formatTime, localDigits } from "@/lib/date";
import { faNum, percent } from "@/lib/format";
import { EVENT_TYPE_LABELS, TEAM_THEME } from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import { Button, Card, EmptyState, PageHeader, Progress, cn } from "@/components/ui";
import { TeamFormSheet } from "@/components/team-form";

export default function TeamsPage() {
  const { data, currentUser, isPlayer, isManager } = useClub();
  const t = useT();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={t(M.shell.navTeams)}
        subtitle={t(M.teams.subtitle, {
          count: faNum(data.teams.length),
          season: localDigits(data.club.season),
        })}
        action={
          isManager ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t(M.teams.newTeam)}
            </Button>
          ) : undefined
        }
      />

      {!data.teams.length ? (
        <EmptyState
          icon={<Shield className="h-5 w-5" />}
          title={t(M.teams.noneYet)}
          description={t(M.teams.noneYetDesc)}
          action={
            isManager ? (
              <Button size="sm" variant="soft" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t(M.teams.defineTeam)}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {data.teams.map((team) => {
          const summary = teamSummary(data, team);
          const theme = TEAM_THEME[team.color];
          const isMine = isPlayer && currentUser?.teamId === team.id;
          return (
            <Link key={team.id} href={`/teams?id=${team.id}`} className="group block">
              <Card className="overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-32px_rgba(16,24,40,0.55)]">
                <div className={cn("relative overflow-hidden bg-gradient-to-br p-5 text-white", theme.gradient)}>
                  <div className="absolute inset-0 court-lines" />
                  <div className="absolute inset-0 court-grid opacity-[0.1]" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] text-white/65">{team.ageGroup}</p>
                      <h2 className="mt-1 text-lg font-extrabold tracking-tight">
                        {t(M.dashboard.teamOf, { name: team.name })}
                      </h2>
                      <p className="mt-1.5 text-[11px] text-white/70">
                        {t(M.teams.coachOf, { coach: team.coach })}
                      </p>
                    </div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                      <Shield className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="relative mt-4 flex items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] ring-1 ring-white/15">
                      {t(M.dashboard.seasonChip, { season: localDigits(team.season) })}
                    </span>
                    {isMine ? (
                      <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-[10px] text-accent-400 ring-1 ring-accent-400/30">
                        {t(M.dashboard.myTeam)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className="grid grid-cols-3 divide-x divide-line/70 rtl:divide-x-reverse text-center">
                    <div>
                      <p className="text-sm font-extrabold text-ink">{faNum(summary.roster.length)}</p>
                      <p className="text-[9px] text-muted">{t(M.teams.playersWord)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-emerald-600">
                        {faNum(summary.record.wins)}
                      </p>
                      <p className="text-[9px] text-muted">{t(M.common.win)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-rose-500">
                        {faNum(summary.record.losses)}
                      </p>
                      <p className="text-[9px] text-muted">{t(M.common.loss)}</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted">{t(M.dashboard.attendanceRate)}</span>
                      <span className="font-semibold text-ink">{percent(summary.attendanceRate)}</span>
                    </div>
                    <Progress value={summary.attendanceRate} className="mt-1.5 h-1.5" />
                  </div>

                  <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted" />
                    {summary.next ? (
                      <p className="min-w-0 flex-1 truncate text-[10px] text-ink-soft">
                        {EVENT_TYPE_LABELS[summary.next.type]} · {formatDay(summary.next.startsAt)} ·{" "}
                        {formatTime(summary.next.startsAt)}
                      </p>
                    ) : (
                      <p className="flex-1 text-[10px] text-muted">{t(M.teams.noEventPlanned)}</p>
                    )}
                    <ChevronLeft className="h-3.5 w-3.5 text-muted/60 transition group-hover:text-brand-500 ltr:rotate-180" />
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="flex items-center gap-3 bg-white/60 p-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Users className="h-4 w-4" />
        </span>
        <p className="text-[11px] leading-5 text-muted">{t(M.teams.cardHint)}</p>
      </Card>

      <TeamFormSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

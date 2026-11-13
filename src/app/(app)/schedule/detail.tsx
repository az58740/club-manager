"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  Clock,
  Dumbbell,
  MapPin,
  Trash2,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import { useClub } from "@/lib/store";
import {
  attendanceBreakdown,
  eventAttendance,
  matchScore,
  matchStatsForEvent,
  playersOfTeam,
  teamById,
} from "@/lib/selectors";
import {
  ATTENDANCE_LABELS,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  PERIOD_LABELS,
  PLAYER_STATUS_LABELS,
  STAT_LABELS,
  TEAM_THEME,
} from "@/lib/labels";
import { formatDateFull, formatDay, formatTime, relativeDay, timeUntil } from "@/lib/date";
import { faNum, percent, uid } from "@/lib/format";
import { M, useT } from "@/lib/i18n/messages";
import type { AttendanceStatus, ClubEvent } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Progress,
  cn,
} from "@/components/ui";
import { ResultSheet } from "@/components/result-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";

const attendanceOptions: AttendanceStatus[] = ["present", "late", "absent", "excused"];

const attendanceActive: Record<AttendanceStatus, string> = {
  present: "bg-emerald-600 text-white ring-emerald-600",
  late: "bg-amber-500 text-white ring-amber-500",
  absent: "bg-rose-600 text-white ring-rose-600",
  excused: "bg-slate-500 text-white ring-slate-500",
};

const attendanceTone = {
  present: "emerald",
  late: "amber",
  absent: "rose",
  excused: "slate",
} as const;

const attendanceColor: Record<AttendanceStatus, string> = {
  present: "text-emerald-600",
  late: "text-amber-600",
  absent: "text-rose-600",
  excused: "text-slate-500",
};

export default function EventDetailPage({ recordId }: { recordId: string }) {
  const id = recordId;
  const { data, currentUser, isManager, isCoach, isPlayer, update, toast } = useClub();
  const t = useT();
  const [resultOpen, setResultOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const event: ClubEvent | undefined = data.events.find((row) => row.id === id);

  const roster = useMemo(() => {
    if (!event) return [];
    return playersOfTeam(data, event.teamId)
      .filter((player) => player.status !== "inactive")
      .sort((a, b) => a.jersey - b.jersey);
  }, [data, event]);

  if (!event) {
    return (
      <EmptyState
        className="mt-6"
        icon={<CalendarDays className="h-5 w-5" />}
        title={t(M.schedule.notFound)}
        description={t(M.schedule.notFoundDesc)}
        action={
          <Link href="/schedule">
            <Button variant="soft" size="sm">
              {t(M.schedule.backToSchedule)}
            </Button>
          </Link>
        }
      />
    );
  }

  const team = teamById(data, event.teamId);
  const theme = team ? TEAM_THEME[team.color] : null;
  const isMatch = event.type === "match";
  const canEdit = isManager || isCoach;
  const statLabels = STAT_LABELS[data.club.sport];
  const periodLabel = PERIOD_LABELS[data.club.sport];
  const records = eventAttendance(data, event.id);
  const summary = attendanceBreakdown(records);
  const score = matchScore(event, data.club.sport);
  const hasResult = Boolean(event.sets?.length);
  const statRows = matchStatsForEvent(data, event.id);
  const myRecord = records.find((row) => row.playerId === currentUser?.playerId);

  const setAttendance = (playerId: string, status: AttendanceStatus) => {
    update((current) => {
      const existing = current.attendance.find(
        (row) => row.eventId === event.id && row.playerId === playerId,
      );
      if (existing) {
        return {
          ...current,
          attendance: current.attendance.map((row) =>
            row.id === existing.id ? { ...row, status } : row,
          ),
        };
      }
      return {
        ...current,
        attendance: [
          ...current.attendance,
          { id: uid("att"), eventId: event.id, playerId, status },
        ],
      };
    });
  };

  const removeEvent = () => {
    update((current) => ({
      ...current,
      events: current.events.filter((row) => row.id !== event.id),
      attendance: current.attendance.filter((row) => row.eventId !== event.id),
      stats: current.stats.filter((row) => row.eventId !== event.id),
    }));
    toast(t(M.schedule.deleted), "info");
  };

  const visibleRoster = isPlayer && currentUser?.playerId
    ? roster.filter((player) => player.id === currentUser.playerId)
    : roster;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href="/schedule"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted transition hover:text-ink"
        >
          <ArrowRight className="h-4 w-4 ltr:rotate-180" />
          {t(M.shell.navSchedule)}
        </Link>
        <div className="flex items-center gap-2">
          {isMatch && canEdit ? (
            <Button size="sm" variant={hasResult ? "outline" : "primary"} onClick={() => setResultOpen(true)}>
              <Trophy className="h-3.5 w-3.5" />
              {t(hasResult ? M.schedule.editResult : M.schedule.recordResult)}
            </Button>
          ) : null}
          {isManager ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-xl text-muted ring-1 ring-line transition hover:bg-rose-50 hover:text-rose-600 hover:ring-rose-200"
              aria-label={t(M.schedule.deleteEvent)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <section className="overflow-hidden rounded-[28px] bg-white ring-1 ring-line/80">
        <div
          className={cn(
            "relative overflow-hidden bg-gradient-to-br p-5 text-white sm:p-6",
            theme?.gradient ?? "from-brand-600 to-night-900",
          )}
        >
          <div className="absolute inset-0 court-lines" />
          <div className="absolute inset-0 court-grid opacity-[0.1]" />

          <div className="relative flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] ring-1 ring-white/20">
              {isMatch ? <Trophy className="h-3 w-3" /> : <Dumbbell className="h-3 w-3" />}
              {EVENT_TYPE_LABELS[event.type]}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] text-white/80 ring-1 ring-white/15">
              {EVENT_STATUS_LABELS[event.status]}
            </span>
            {event.status === "scheduled" ? (
              <span className="rounded-full bg-accent-500/20 px-2.5 py-1 text-[10px] text-accent-400 ring-1 ring-accent-400/30">
                {timeUntil(event.startsAt) ?? relativeDay(event.startsAt)}
              </span>
            ) : null}
          </div>

          <h1 className="relative mt-3 text-xl font-extrabold leading-snug sm:text-2xl">
            {event.title}
          </h1>
          {event.opponent ? (
            <p className="relative mt-1 text-[12px] text-white/75">
              {t(M.dashboard.versus, { opponent: event.opponent })}
            </p>
          ) : null}

          <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/70">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDateFull(event.startsAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(event.startsAt)} · {t(M.dashboard.minutes, { count: faNum(event.durationMin) })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {event.location}
            </span>
            {team ? (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {t(M.dashboard.teamOf, { name: team.name })}
              </span>
            ) : null}
          </div>

          {event.reminderNote ? (
            <p className="relative mt-4 flex items-start gap-2 rounded-xl bg-accent-500/15 px-3 py-2 text-[11px] leading-5 text-accent-400 ring-1 ring-accent-400/25">
              <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t(M.schedule.reminderPrefix, { note: event.reminderNote })}
            </p>
          ) : null}

          {event.notes ? (
            <p className="relative mt-4 rounded-xl bg-white/10 px-3 py-2 text-[11px] leading-5 text-white/75 ring-1 ring-white/10">
              {event.notes}
            </p>
          ) : null}
        </div>
      </section>

      {isMatch ? (
        <>
          <Card className="overflow-hidden">
            <div className="bg-night-900 px-4 py-5 text-white sm:px-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 text-center">
                  <p className="truncate text-[11px] text-white/60">
                    {team?.name ?? t(M.schedule.ourTeam)}
                  </p>
                  <p className="mt-1 text-3xl font-black">{hasResult ? faNum(score.home) : "–"}</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-white/40">{t(M.schedule.resultWord)}</span>
                  <Trophy className="h-4 w-4 text-accent-400" />
                </div>
                <div className="min-w-0 flex-1 text-center">
                  <p className="truncate text-[11px] text-white/60">
                    {event.opponent ?? t(M.schedule.opponentWord)}
                  </p>
                  <p className="mt-1 text-3xl font-black">{hasResult ? faNum(score.away) : "–"}</p>
                </div>
              </div>

              {hasResult ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                  {event.sets?.map((set, index) => (
                    <span
                      key={index}
                      className="rounded-lg bg-white/10 px-2 py-1 text-[10px] text-white/75 ring-1 ring-white/10"
                    >
                      {periodLabel} {faNum(index + 1)}: {faNum(set.home)}–{faNum(set.away)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-center text-[11px] text-white/50">
                  {t(M.schedule.noResultYet)}
                </p>
              )}
            </div>

            {hasResult ? (
              <div className="flex items-center justify-center gap-2 bg-white px-4 py-3 text-[12px] font-semibold">
                {score.home > score.away ? (
                  <Badge tone="emerald">
                    {t(M.schedule.winLine, { home: faNum(score.home), away: faNum(score.away) })}
                  </Badge>
                ) : (
                  <Badge tone="rose">
                    {t(M.schedule.lossLine, { home: faNum(score.home), away: faNum(score.away) })}
                  </Badge>
                )}
              </div>
            ) : null}
          </Card>

          {statRows.length ? (
            <Card className="overflow-hidden">
              <div className="px-5 pt-5">
                <h2 className="text-[15px] font-bold text-ink">{t(M.schedule.playerStatsTitle)}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t(M.schedule.playerStatsSub)}</p>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-[11px]">
                  <thead>
                    <tr className="border-y border-line/70 bg-slate-50/70 text-muted">
                      <th className="px-4 py-2 text-start font-medium">{t(M.common.playerWord)}</th>
                      <th className="px-2 py-2 text-center font-medium">{statLabels.total}</th>
                      <th className="px-2 py-2 text-center font-medium">{statLabels.serve}</th>
                      <th className="px-2 py-2 text-center font-medium">{statLabels.attack}</th>
                      <th className="px-2 py-2 text-center font-medium">{statLabels.block}</th>
                      <th className="px-2 py-2 text-center font-medium">{statLabels.digs}</th>
                      <th className="px-2 py-2 text-center font-medium">{statLabels.errors}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {statRows.map(({ stat, player }) => (
                      <tr key={stat.id}>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/players?id=${player.id}`}
                            className="flex items-center gap-2 hover:text-brand-600"
                          >
                            <Avatar name={player.fullName} size="xs" ring={false} />
                            <span className="text-[11px] font-medium">{player.fullName}</span>
                          </Link>
                        </td>
                        <td className="px-2 py-2.5 text-center font-extrabold text-brand-700">
                          {faNum(stat.servePoints + stat.attackPoints + stat.blockPoints)}
                        </td>
                        <td className="px-2 py-2.5 text-center">{faNum(stat.servePoints)}</td>
                        <td className="px-2 py-2.5 text-center">{faNum(stat.attackPoints)}</td>
                        <td className="px-2 py-2.5 text-center">{faNum(stat.blockPoints)}</td>
                        <td className="px-2 py-2.5 text-center">{faNum(stat.digs)}</td>
                        <td className="px-2 py-2.5 text-center text-muted">{faNum(stat.errors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      ) : (
        <>
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
                  <UserCheck className="h-4 w-4 text-brand-600" />
                  {t(M.schedule.attendanceTitle)}
                </h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  {summary.total
                    ? t(M.schedule.presentOf, {
                        rate: percent(summary.attendanceRate),
                        count: faNum(summary.total),
                      })
                    : t(M.schedule.noAttendanceYet)}
                </p>
              </div>
              {summary.total ? (
                <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  {percent(summary.attendanceRate)}
                </span>
              ) : null}
            </div>

            <Progress
              value={summary.attendanceRate}
              className="mt-3"
              tone="bg-emerald-500"
            />

            <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
              {attendanceOptions.map((status) => (
                <div key={status} className="rounded-xl bg-slate-50 py-2">
                  <p className={cn("text-[15px] font-extrabold", attendanceColor[status])}>
                    {faNum(summary[status])}
                  </p>
                  <p className="text-[9px] text-muted">{ATTENDANCE_LABELS[status]}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="divide-y divide-line/70 overflow-hidden">
            {visibleRoster.map((player) => {
              const record = records.find((row) => row.playerId === player.id);
              return (
                <div key={player.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-50 text-[10px] font-bold text-ink-soft ring-1 ring-line">
                      {faNum(player.jersey)}
                    </span>
                    <Avatar name={player.fullName} size="xs" ring={false} />
                    <Link
                      href={`/players?id=${player.id}`}
                      className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink hover:text-brand-600"
                    >
                      {player.fullName}
                    </Link>
                    {player.status !== "active" ? (
                      <Badge tone="amber">{PLAYER_STATUS_LABELS[player.status]}</Badge>
                    ) : null}
                    {!canEdit ? (
                      <Badge tone={record ? attendanceTone[record.status] : "slate"}>
                        {record ? ATTENDANCE_LABELS[record.status] : t(M.schedule.notRecorded)}
                      </Badge>
                    ) : null}
                  </div>

                  {canEdit ? (
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {attendanceOptions.map((status) => {
                        const active = record?.status === status;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setAttendance(player.id, status)}
                            className={cn(
                              "flex h-7 items-center justify-center gap-1 rounded-lg text-[10px] font-medium ring-1 transition",
                              active
                                ? attendanceActive[status]
                                : "bg-white text-muted ring-line hover:bg-slate-50",
                            )}
                          >
                            {active ? <Check className="h-3 w-3" /> : null}
                            {ATTENDANCE_LABELS[status]}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!visibleRoster.length ? (
              <p className="px-4 py-8 text-center text-[12px] text-muted">
                {t(M.schedule.noPlayersToMark)}
              </p>
            ) : null}
          </Card>

          {isPlayer && !myRecord ? (
            <p className="px-1 text-center text-[11px] text-muted">
              {t(M.schedule.yourStatusPending)}
            </p>
          ) : null}
        </>
      )}

      <ResultSheet open={resultOpen} onClose={() => setResultOpen(false)} event={event} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={removeEvent}
        title={t(M.schedule.deleteEvent)}
        description={t(M.schedule.deleteDesc)}
        confirmLabel={t(M.schedule.deleteEvent)}
        danger
      />
    </div>
  );
}

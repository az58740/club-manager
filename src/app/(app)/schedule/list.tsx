"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  Clock,
  Dumbbell,
  MapPin,
  Trophy,
} from "lucide-react";
import { useClub } from "@/lib/store";
import {
  attendanceBreakdown,
  eventAttendance,
  matchScore,
  pastEvents,
  teamById,
  upcomingEvents,
} from "@/lib/selectors";
import { EVENT_TYPE_LABELS, TEAM_THEME } from "@/lib/labels";
import { dayKey, formatDay, formatTime, relativeDay } from "@/lib/date";
import { faNum, percent } from "@/lib/format";
import { M, useT } from "@/lib/i18n/messages";
import type { ClubEvent, EventType } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  Select,
  cn,
} from "@/components/ui";
import { EventFormSheet } from "@/components/event-form";

type View = "upcoming" | "past";
type TypeFilter = "all" | EventType;

const typeFilters: TypeFilter[] = ["all", "training", "match"];

export default function SchedulePage() {
  const { data, isManager, isCoach, isPlayer, currentUser } = useClub();
  const t = useT();
  const [view, setView] = useState<View>("upcoming");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const now = new Date();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setFormOpen(true);
      window.history.replaceState({}, "", "/schedule");
    }
  }, []);

  const canEdit = isManager || isCoach;

  useEffect(() => {
    if (isPlayer && currentUser?.teamId) setTeamFilter(currentUser.teamId);
  }, [isPlayer, currentUser?.teamId]);

  const events = useMemo(() => {
    const source = view === "upcoming" ? upcomingEvents(data, now) : pastEvents(data, now);
    return source
      .filter((event) => (typeFilter === "all" ? true : event.type === typeFilter))
      .filter((event) => (teamFilter === "all" ? true : event.teamId === teamFilter));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, view, typeFilter, teamFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, { date: string; events: ClubEvent[] }>();
    for (const event of events) {
      const key = dayKey(event.startsAt);
      const current = map.get(key);
      if (current) current.events.push(event);
      else map.set(key, { date: event.startsAt, events: [event] });
    }
    return Array.from(map.values()).sort((a, b) =>
      view === "upcoming"
        ? +new Date(a.date) - +new Date(b.date)
        : +new Date(b.date) - +new Date(a.date),
    );
  }, [events, view]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={t(M.shell.navSchedule)}
        subtitle={t(M.schedule.subtitle)}
        action={
          canEdit ? (
            <Button size="sm" onClick={() => setFormOpen(true)} className="shrink-0">
              <CalendarPlus className="h-4 w-4" />
              {t(M.schedule.newEvent)}
            </Button>
          ) : undefined
        }
      />

      <Card className="space-y-3 p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented<View>
            className="sm:w-56"
            value={view}
            onChange={setView}
            options={[
              { value: "upcoming", label: t(M.schedule.viewUpcoming) },
              { value: "past", label: t(M.schedule.viewPast) },
            ]}
          />
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {typeFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setTypeFilter(filter)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[11px] font-medium ring-1 transition",
                  typeFilter === filter
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-white text-ink-soft ring-line hover:bg-slate-50",
                )}
              >
                {filter === "all" ? t(M.form.all) : EVENT_TYPE_LABELS[filter]}
              </button>
            ))}
          </div>
          {!isPlayer ? (
            <div className="w-full shrink-0 sm:w-36">
              <Select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                className="h-9 text-[12px]"
              >
                <option value="all">{t(M.form.allTeams)}</option>
                {data.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      </Card>

      {groups.length ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={dayKey(group.date)}>
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted" />
                  <p className="text-[12px] font-bold text-ink">{formatDay(group.date)}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-muted ring-1 ring-line/70">
                  {relativeDay(group.date, now)}
                </span>
              </div>

              <Card className="divide-y divide-line/70 overflow-hidden">
                {group.events.map((event) => {
                  const team = teamById(data, event.teamId);
                  const isMatch = event.type === "match";
                  const score = isMatch ? matchScore(event, data.club.sport) : null;
                  const hasResult = Boolean(event.sets?.length);
                  const attendance = isMatch
                    ? null
                    : attendanceBreakdown(eventAttendance(data, event.id));
                  return (
                    <Link
                      key={event.id}
                      href={`/schedule?id=${event.id}`}
                      className="flex items-center gap-3 px-3.5 py-3.5 transition hover:bg-slate-50/70 sm:px-5"
                    >
                      <span
                        className={cn(
                          "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                          isMatch ? "bg-rose-50 text-rose-600" : "bg-brand-50 text-brand-600",
                        )}
                      >
                        {isMatch ? <Trophy className="h-4 w-4" /> : <Dumbbell className="h-4 w-4" />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-ink">
                            {event.title}
                          </p>
                          {team ? (
                            <span
                              className={cn(
                                "hidden shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ring-1 ring-inset sm:inline-flex",
                                TEAM_THEME[team.color].chip,
                              )}
                            >
                              {team.name}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(event.startsAt)}
                            {event.opponent
                              ? ` · ${t(M.dashboard.versus, { opponent: event.opponent })}`
                              : ""}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </span>
                          {event.reminderNote ? (
                            <span
                              title={event.reminderNote}
                              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-700 ring-1 ring-amber-100"
                            >
                              <BellRing className="h-2.5 w-2.5" />
                              {t(M.schedule.reminderPrefix, { note: event.reminderNote })}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {hasResult && score ? (
                        <div className="text-end">
                          <p
                            className={cn(
                              "text-[13px] font-extrabold",
                              score.home > score.away ? "text-emerald-600" : "text-rose-600",
                            )}
                          >
                            {faNum(score.home)} – {faNum(score.away)}
                          </p>
                          <p className="text-[9px] text-muted">
                            {t(score.home > score.away ? M.common.win : M.common.loss)}
                          </p>
                        </div>
                      ) : attendance && attendance.total ? (
                        <Badge tone="emerald">
                          {t(M.schedule.attendanceBadge, {
                            rate: percent(attendance.attendanceRate),
                          })}
                        </Badge>
                      ) : (
                        <Badge tone={isMatch ? "rose" : "brand"}>
                          {EVENT_TYPE_LABELS[event.type]}
                        </Badge>
                      )}

                      <ChevronLeft className="h-4 w-4 shrink-0 text-muted/60 ltr:rotate-180" />
                    </Link>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title={t(view === "upcoming" ? M.schedule.emptyUpcoming : M.schedule.emptyPast)}
          description={t(
            view === "upcoming" ? M.schedule.emptyUpcomingDesc : M.schedule.emptyPastDesc,
          )}
          action={
            canEdit ? (
              <Button size="sm" variant="soft" onClick={() => setFormOpen(true)}>
                <CalendarPlus className="h-4 w-4" />
                {t(M.schedule.addEvent)}
              </Button>
            ) : undefined
          }
        />
      )}

      {canEdit ? <EventFormSheet open={formOpen} onClose={() => setFormOpen(false)} /> : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useClub } from "@/lib/store";
import type { ClubEvent, MatchStat, SetScore } from "@/lib/types";
import { playersOfTeam } from "@/lib/selectors";
import { PERIOD_COUNT, PERIOD_LABELS, STAT_LABELS } from "@/lib/labels";
import { faNum } from "@/lib/format";
import { Button, Sheet, cn } from "@/components/ui";
import { M, useT } from "@/lib/i18n/messages";

interface StatInput {
  serve: string;
  attack: string;
  block: string;
  digs: string;
  errors: string;
}

const emptyStat = (): StatInput => ({ serve: "", attack: "", block: "", digs: "", errors: "" });

export function ResultSheet({
  open,
  onClose,
  event,
}: {
  open: boolean;
  onClose: () => void;
  event: ClubEvent | null;
}) {
  const { data, update, toast } = useClub();
  const t = useT();
  const statLabels = STAT_LABELS[data.club.sport];
  const periodLabel = PERIOD_LABELS[data.club.sport];
  const statColumns: Array<{ key: keyof StatInput; label: string }> = [
    { key: "serve", label: statLabels.serve },
    { key: "attack", label: statLabels.attack },
    { key: "block", label: statLabels.block },
    { key: "digs", label: statLabels.digs },
    { key: "errors", label: statLabels.errors },
  ];
  const [sets, setSets] = useState<Array<{ home: string; away: string }>>(
    Array.from({ length: PERIOD_COUNT[data.club.sport] }, () => ({ home: "", away: "" })),
  );
  const [stats, setStats] = useState<Record<string, StatInput>>({});

  const roster = event
    ? playersOfTeam(data, event.teamId)
        .filter((player) => player.status !== "inactive")
        .sort((a, b) => a.jersey - b.jersey)
    : [];

  useEffect(() => {
    if (!open || !event) return;
    const periodCount = Math.max(
      PERIOD_COUNT[data.club.sport],
      event.sets?.length ?? 0,
    );
    const nextSets = Array.from({ length: periodCount }, (_, index) => {
      const existing = event.sets?.[index];
      return {
        home: existing ? String(existing.home) : "",
        away: existing ? String(existing.away) : "",
      };
    });
    setSets(nextSets);

    const nextStats: Record<string, StatInput> = {};
    for (const player of roster) {
      const existing = data.stats.find(
        (row) => row.eventId === event.id && row.playerId === player.id,
      );
      nextStats[player.id] = existing
        ? {
            serve: String(existing.servePoints),
            attack: String(existing.attackPoints),
            block: String(existing.blockPoints),
            digs: String(existing.digs),
            errors: String(existing.errors),
          }
        : emptyStat();
    }
    setStats(nextStats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);

  if (!event) return null;

  const completedSets: SetScore[] = sets
    .filter((set) => set.home !== "" && set.away !== "")
    .map((set) => ({ home: Number(set.home), away: Number(set.away) }))
    .filter(
      (set) =>
        Number.isInteger(set.home) &&
        Number.isInteger(set.away) &&
        set.home >= 0 &&
        set.away >= 0,
    );

  const homeWins = completedSets.filter((set) => set.home > set.away).length;
  const awayWins = completedSets.filter((set) => set.away > set.home).length;
  const totalHome = completedSets.reduce((sum, set) => sum + set.home, 0);
  const totalAway = completedSets.reduce((sum, set) => sum + set.away, 0);
  const isVolleyball = data.club.sport === "volleyball";
  const summaryHome = isVolleyball ? homeWins : totalHome;
  const summaryAway = isVolleyball ? awayWins : totalAway;

  const submit = (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!completedSets.length) {
      toast(t(M.schedule.errMinScore, { period: periodLabel }), "error");
      return;
    }

    const rows: MatchStat[] = roster.map((player) => {
      const row = stats[player.id] ?? emptyStat();
      return {
        id: `stat-${event.id}-${player.id}`,
        eventId: event.id,
        playerId: player.id,
        servePoints: Number(row.serve) || 0,
        attackPoints: Number(row.attack) || 0,
        blockPoints: Number(row.block) || 0,
        digs: Number(row.digs) || 0,
        errors: Number(row.errors) || 0,
      };
    });

    update((current) => ({
      ...current,
      events: current.events.map((row) =>
        row.id === event.id
          ? { ...row, sets: completedSets, status: "done" as const }
          : row,
      ),
      stats: [...current.stats.filter((row) => row.eventId !== event.id), ...rows],
    }));
    toast(t(M.schedule.resultSaved));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(M.schedule.resultSheetTitle)}
      description={`${event.title}${event.opponent ? ` · ${t(M.schedule.vsOpponent, { name: event.opponent })}` : ""}`}
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="result-form" className="flex-1">
            {t(M.schedule.recordResult)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="result-form" onSubmit={submit} className="space-y-5">
        <div className="rounded-2xl bg-slate-50 p-3.5">
          <div className="flex items-center justify-between text-[12px] font-semibold text-ink">
            <span>{t(M.schedule.periodsHeader, { period: periodLabel })}</span>
            <span className="text-muted">
              {faNum(summaryHome)} — {faNum(summaryAway)}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {sets.map((set, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-14 text-[11px] text-muted">
                  {periodLabel} {faNum(index + 1)}
                </span>
                <input
                  type="number"
                  min={0}
                  max={35}
                  inputMode="numeric"
                  value={set.home}
                  onChange={(event) =>
                    setSets((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, home: event.target.value } : row,
                      ),
                    )
                  }
                  aria-label={t(M.schedule.ourScoreAria, {
                    period: periodLabel,
                    index: faNum(index + 1),
                  })}
                  placeholder="—"
                  className="h-9 w-14 rounded-lg bg-white text-center text-sm font-bold text-ink ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-muted">–</span>
                <input
                  type="number"
                  min={0}
                  max={35}
                  inputMode="numeric"
                  value={set.away}
                  onChange={(event) =>
                    setSets((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, away: event.target.value } : row,
                      ),
                    )
                  }
                  aria-label={t(M.schedule.oppScoreAria, {
                    period: periodLabel,
                    index: faNum(index + 1),
                  })}
                  placeholder="—"
                  className="h-9 w-14 rounded-lg bg-white text-center text-sm font-bold text-ink ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="ms-auto text-[10px] text-muted">{t(M.schedule.usVsOpponent)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-bold text-ink">{t(M.schedule.playerStatsTitle)}</h3>
            <span className="text-[10px] text-muted">{statLabels.summary}</span>
          </div>
          <div className="mt-2 overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[420px] border-separate border-spacing-y-1 text-[11px]">
              <thead>
                <tr className="text-muted">
                  <th className="pb-1 pe-1 text-end font-medium">{t(M.common.playerWord)}</th>
                  {statColumns.map((column) => (
                    <th key={column.key} className="pb-1 text-center font-medium">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((player) => (
                  <tr key={player.id}>
                    <td className="max-w-[110px] truncate ps-1">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-[9px] font-bold text-ink-soft",
                          )}
                        >
                          {faNum(player.jersey)}
                        </span>
                        <span className="truncate text-[11px] font-medium text-ink">
                          {player.fullName}
                        </span>
                      </span>
                    </td>
                    {statColumns.map((column) => (
                      <td key={column.key} className="px-0.5">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={stats[player.id]?.[column.key] ?? ""}
                          onChange={(event) =>
                            setStats((current) => ({
                              ...current,
                              [player.id]: {
                                ...(current[player.id] ?? emptyStat()),
                                [column.key]: event.target.value,
                              },
                            }))
                          }
                          aria-label={`${column.label} ${player.fullName}`}
                          placeholder={faNum(0)}
                          className="h-8 w-11 rounded-lg bg-white text-center text-[11px] ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

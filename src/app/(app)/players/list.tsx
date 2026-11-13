"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Pencil, Plus, SearchX, ShieldCheck, ShieldOff, UserRound, Users } from "lucide-react";
import { useClub } from "@/lib/store";
import type { Player, PlayerStatus } from "@/lib/types";
import { PLAYER_STATUS_LABELS, POSITION_LABELS, TEAM_THEME } from "@/lib/labels";
import { playerTotalDebt } from "@/lib/selectors";
import { compactToman, faNum } from "@/lib/format";
import { M, useT } from "@/lib/i18n/messages";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchField,
  Select,
  cn,
} from "@/components/ui";
import { PlayerFormSheet } from "@/components/player-form";

const statusFilters: Array<"all" | PlayerStatus> = ["all", "active", "injured", "inactive"];

const statusTone: Record<PlayerStatus, "emerald" | "amber" | "slate"> = {
  active: "emerald",
  injured: "amber",
  inactive: "slate",
};

function searchKey(text: string) {
  return text
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\s]/g, "")
    .toLowerCase();
}

export default function PlayersPage() {
  const { data, isManager, isCoach } = useClub();
  const t = useT();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | PlayerStatus>("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setFormOpen(true);
      window.history.replaceState({}, "", "/players");
    }
  }, []);

  const canEdit = isManager || isCoach;

  const players = useMemo(() => {
    const teamOrder = new Map(data.teams.map((team, index) => [team.id, index]));
    const needle = searchKey(query);
    return [...data.players]
      .filter((player) => (status === "all" ? true : player.status === status))
      .filter((player) => (teamFilter === "all" ? true : player.teamId === teamFilter))
      .filter((player) => {
        if (!needle) return true;
        const team = data.teams.find((row) => row.id === player.teamId);
        return [
          player.fullName,
          team?.name ?? "",
          team?.ageGroup ?? "",
          player.phone,
          POSITION_LABELS[player.position],
          String(player.jersey),
        ]
          .map(searchKey)
          .some((haystack) => haystack.includes(needle));
      })
      .sort(
        (a, b) =>
          (teamOrder.get(a.teamId) ?? 0) - (teamOrder.get(b.teamId) ?? 0) || a.jersey - b.jersey,
      );
  }, [data.players, data.teams, query, status, teamFilter]);

  const activeCount = data.players.filter((player) => player.status === "active").length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={t(M.shell.navPlayers)}
        subtitle={t(M.players.totalSummary, { count: data.players.length, active: activeCount })}
        action={
          canEdit ? (
            <Button size="sm" onClick={() => setFormOpen(true)} className="shrink-0">
              <Plus className="h-4 w-4" />
              {t(M.dashboard.newPlayer)}
            </Button>
          ) : undefined
        }
      />

      <Card className="space-y-3 p-3.5 sm:p-4">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t(M.players.searchPlaceholder)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {statusFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatus(filter)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[11px] font-medium ring-1 transition",
                  status === filter
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-white text-ink-soft ring-line hover:bg-slate-50",
                )}
              >
                {filter === "all" ? t(M.form.all) : PLAYER_STATUS_LABELS[filter]}
              </button>
            ))}
          </div>
          <div className="w-36 shrink-0">
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
        </div>
      </Card>

      {players.length ? (
        <Card className="divide-y divide-line/70 overflow-hidden">
          {players.map((player) => {
            const team = data.teams.find((row) => row.id === player.teamId);
            const debt = playerTotalDebt(player.id, data);
            return (
              <div key={player.id} className="flex items-center gap-1 px-2 py-2 sm:px-3">
                <a
                  href={`/players/?id=${encodeURIComponent(player.id)}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1 transition hover:bg-slate-50/70"
                >
                  <div className="relative">
                    <Avatar name={player.fullName} size="md" ring={false} />
                    <span className="absolute -bottom-1 -end-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[9px] font-bold text-ink-soft ring-1 ring-line">
                      {faNum(player.jersey)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {player.fullName}
                      </p>
                      {player.status !== "active" ? (
                        <Badge tone={statusTone[player.status]}>
                          {PLAYER_STATUS_LABELS[player.status]}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {POSITION_LABELS[player.position]}
                      {team ? ` · ${team.name}` : ""}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 flex items-center gap-1 text-[10px] font-medium",
                        player.insured ? "text-emerald-600" : "text-rose-500",
                      )}
                    >
                      {player.insured ? (
                        <ShieldCheck className="h-3 w-3 shrink-0" />
                      ) : (
                        <ShieldOff className="h-3 w-3 shrink-0" />
                      )}
                      {t(player.insured ? M.players.insured : M.players.notInsured)}
                    </p>
                  </div>

                  {debt > 0 ? (
                    <span className="hidden rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-medium text-rose-600 ring-1 ring-rose-100 sm:inline-flex">
                      {t(M.players.debt, { amount: compactToman(debt) })}
                    </span>
                  ) : canEdit ? (
                    <span className="hidden rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-100 sm:inline-flex">
                      {t(M.players.settledChip)}
                    </span>
                  ) : null}

                  {team ? (
                    <span
                      className={cn(
                        "hidden h-2 w-2 rounded-full lg:block",
                        TEAM_THEME[team.color].dot,
                      )}
                    />
                  ) : null}
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted/60 ltr:rotate-180" />
                </a>
                {canEdit ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="shrink-0"
                    aria-label={`${t(M.form.edit)} ${player.fullName}`}
                    title={t(M.form.edit)}
                    onClick={() => setEditingPlayer(player)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </Card>
      ) : (
        <EmptyState
          icon={query || status !== "all" || teamFilter !== "all" ? <SearchX className="h-5 w-5" /> : <Users className="h-5 w-5" />}
          title={t(query || status !== "all" ? M.players.noneFound : M.players.noneYet)}
          description={t(
            query || status !== "all" ? M.players.noneFoundDesc : M.players.noneYetDesc,
          )}
          action={
            canEdit ? (
              <Button size="sm" variant="soft" onClick={() => setFormOpen(true)}>
                <UserRound className="h-4 w-4" />
                {t(M.players.addPlayer)}
              </Button>
            ) : undefined
          }
        />
      )}

      {canEdit ? (
        <PlayerFormSheet
          open={formOpen || editingPlayer !== null}
          player={editingPlayer}
          onClose={() => {
            setFormOpen(false);
            setEditingPlayer(null);
          }}
          defaultTeamId={undefined}
        />
      ) : null}
    </div>
  );
}

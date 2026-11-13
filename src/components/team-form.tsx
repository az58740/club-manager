"use client";

import { useEffect, useState } from "react";
import { useClub } from "@/lib/store";
import type { Team, TeamColor } from "@/lib/types";
import { TEAM_COLOR_LABELS } from "@/lib/labels";
import { uid } from "@/lib/format";
import { M, useT } from "@/lib/i18n/messages";
import { Button, Field, Input, Segmented, Sheet } from "@/components/ui";

interface FormState {
  name: string;
  ageGroup: string;
  coach: string;
  color: TeamColor;
  season: string;
  homeVenue: string;
}

function emptyForm(season: string): FormState {
  return {
    name: "",
    ageGroup: "",
    coach: "",
    color: "blue",
    season,
    homeVenue: "",
  };
}

export function TeamFormSheet({
  open,
  onClose,
  team,
}: {
  open: boolean;
  onClose: () => void;
  team?: Team | null;
}) {
  const { data, update, toast } = useClub();
  const t = useT();
  const [form, setForm] = useState<FormState>(() => emptyForm(data.club.season));

  useEffect(() => {
    if (!open) return;
    setForm(
      team
        ? {
            name: team.name,
            ageGroup: team.ageGroup,
            coach: team.coach,
            color: team.color,
            season: team.season,
            homeVenue: team.homeVenue,
          }
        : emptyForm(data.club.season),
    );
  }, [open, team, data.club.season]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast(t(M.teamForm.errName), "error");
      return;
    }

    const trimmed = form.name.trim();
    const name = trimmed.replace(/^(?:تیم|Team)\s+/iu, "") || trimmed;
    const payload = {
      name,
      ageGroup: form.ageGroup.trim() || t(M.teamForm.defaultAgeGroup),
      coach: form.coach.trim() || t(M.teamForm.defaultCoach),
      color: form.color,
      season: form.season.trim() || data.club.season,
      homeVenue: form.homeVenue.trim() || t(M.teamForm.defaultVenue),
    };

    if (team) {
      update((current) => ({
        ...current,
        teams: current.teams.map((row) => (row.id === team.id ? { ...row, ...payload } : row)),
      }));
      toast(t(M.teamForm.updated));
    } else {
      update((current) => ({
        ...current,
        teams: [...current.teams, { id: uid("t"), ...payload }],
      }));
      toast(t(M.teamForm.created));
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(team ? M.teamForm.titleEdit : M.teamForm.titleNew)}
      description={t(team ? M.teamForm.descEdit : M.teamForm.descNew)}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="team-form" className="flex-1">
            {t(team ? M.form.save : M.teamForm.titleNew)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="team-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t(M.teamForm.teamName)} required className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder={t(M.teamForm.phTeamName)}
            autoFocus
          />
        </Field>

        <Field label={t(M.teamForm.ageGroup)}>
          <Input
            value={form.ageGroup}
            onChange={(event) => set("ageGroup", event.target.value)}
            placeholder={t(M.teamForm.phAgeGroup)}
          />
        </Field>

        <Field label={t(M.teamForm.coach)}>
          <Input
            value={form.coach}
            onChange={(event) => set("coach", event.target.value)}
            placeholder={t(M.teamForm.phCoach)}
          />
        </Field>

        <Field label={t(M.teamForm.season)}>
          <Input
            value={form.season}
            onChange={(event) => set("season", event.target.value)}
            placeholder={data.club.season}
          />
        </Field>

        <Field label={t(M.teamForm.venue)}>
          <Input
            value={form.homeVenue}
            onChange={(event) => set("homeVenue", event.target.value)}
            placeholder={t(M.teamForm.phVenue)}
          />
        </Field>

        <Field label={t(M.teamForm.color)} className="sm:col-span-2">
          <Segmented<TeamColor>
            value={form.color}
            onChange={(value) => set("color", value)}
            options={(Object.keys(TEAM_COLOR_LABELS) as TeamColor[]).map((color) => ({
              value: color,
              label: TEAM_COLOR_LABELS[color],
            }))}
          />
        </Field>
      </form>
    </Sheet>
  );
}

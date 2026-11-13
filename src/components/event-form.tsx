"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { useClub } from "@/lib/store";
import type { ClubEvent, EventType } from "@/lib/types";
import { combineDateTime, toDateInput, toTimeInput } from "@/lib/date";
import { uid } from "@/lib/format";
import { EVENT_TYPE_LABELS } from "@/lib/labels";
import { M, tr, useT } from "@/lib/i18n/messages";
import { Button, Field, Input, JalaliDateInput, Segmented, Select, Sheet, Textarea } from "@/components/ui";

interface FormState {
  type: EventType;
  teamId: string;
  title: string;
  opponent: string;
  date: string;
  time: string;
  durationMin: string;
  location: string;
  reminder: string;
  notes: string;
}

/** Titles the form fills in itself start with the event word, in either language. */
const AUTO_TITLE_PREFIXES = ["تمرین", "مسابقه", "Training", "Match"];

function emptyForm(teamId = ""): FormState {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    type: "training",
    teamId,
    title: "",
    opponent: "",
    date: toDateInput(tomorrow),
    time: "18:00",
    durationMin: "90",
    location: "",
    reminder: "",
    notes: "",
  };
}

export function EventFormSheet({
  open,
  onClose,
  defaultTeamId,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  defaultTeamId?: string;
  defaultDate?: string;
}) {
  const { data, update, toast } = useClub();
  const t = useT();
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultTeamId));

  useEffect(() => {
    if (!open) return;
    const base = emptyForm(defaultTeamId);
    setForm({
      ...base,
      date: defaultDate ? toDateInput(defaultDate) : base.date,
    });
  }, [open, defaultTeamId, defaultDate]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const selectTeam = (teamId: string) => {
    const team = data.teams.find((row) => row.id === teamId);
    setForm((current) => ({
      ...current,
      teamId,
      title:
        current.title ||
        `${EVENT_TYPE_LABELS[current.type]} ${team?.name ?? ""}`.trim(),
      location: current.location || team?.homeVenue || "",
    }));
  };

  const switchType = (type: EventType) => {
    setForm((current) => ({
      ...current,
      type,
      title: AUTO_TITLE_PREFIXES.some((prefix) => current.title.startsWith(prefix))
        ? ""
        : current.title,
    }));
  };

  const submit = (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!form.teamId) {
      toast(t(M.eventForm.errTeam), "error");
      return;
    }
    if (!form.title.trim()) {
      toast(t(M.eventForm.errTitle), "error");
      return;
    }
    if (!form.date || !form.time) {
      toast(t(M.eventForm.errDateTime), "error");
      return;
    }

    const startsAt = combineDateTime(form.date, form.time);
    const newEvent: ClubEvent = {
      id: uid("e"),
      type: form.type,
      teamId: form.teamId,
      title: form.title.trim(),
      opponent: form.type === "match" ? form.opponent.trim() || undefined : undefined,
      location: form.location.trim() || tr(M.eventForm.defaultVenue),
      startsAt,
      durationMin: Number(form.durationMin) || 90,
      status: "scheduled",
      notes: form.notes.trim() || undefined,
      reminderNote: form.reminder.trim() || undefined,
    };

    update((current) => ({ ...current, events: [...current.events, newEvent] }));
    toast(t(M.eventForm.scheduled, { type: form.type === "match" ? tr(M.eventForm.typeMatch) : tr(M.eventForm.typeTraining) }));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(M.eventForm.title)}
      description={t(M.eventForm.desc)}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="event-form" className="flex-1">
            {t(M.eventForm.submit)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="event-form" onSubmit={submit} className="space-y-4">
        <Segmented<EventType>
          value={form.type}
          onChange={switchType}
          options={[
            { value: "training", label: EVENT_TYPE_LABELS.training },
            { value: "match", label: EVENT_TYPE_LABELS.match },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(M.login.team)} required>
            <Select value={form.teamId} onChange={(event) => selectTeam(event.target.value)}>
              <option value="">{t(M.form.selectTeam)}</option>
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} · {team.ageGroup}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={form.type === "match" ? t(M.eventForm.opponentLabel) : t(M.eventForm.trainingTitle)}
            required={form.type === "training"}
          >
            {form.type === "match" ? (
              <Input
                value={form.opponent}
                onChange={(event) => set("opponent", event.target.value)}
                placeholder={t(M.eventForm.phOpponent)}
              />
            ) : (
              <Input
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder={t(M.eventForm.phTrainingTitle)}
              />
            )}
          </Field>

          {form.type === "match" ? (
            <Field label={t(M.eventForm.matchTitle)} required className="sm:col-span-2">
              <Input
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder={t(M.eventForm.phMatchTitle)}
              />
            </Field>
          ) : null}

          <Field label={t(M.eventForm.date)} required>
            <JalaliDateInput value={form.date} onChange={(value) => set("date", value)} />
          </Field>

          <Field label={t(M.eventForm.startTime)} required>
            <Input
              type="time"
              value={form.time}
              onChange={(event) => set("time", event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>

          <Field label={t(M.eventForm.duration)}>
            <Input
              type="number"
              inputMode="numeric"
              min={15}
              step={15}
              value={form.durationMin}
              onChange={(event) => set("durationMin", event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>

          <Field label={t(M.eventForm.venue)}>
            <Input
              value={form.location}
              onChange={(event) => set("location", event.target.value)}
              placeholder={t(M.eventForm.phVenue)}
            />
          </Field>

          <Field label={t(M.eventForm.reminder)} className="sm:col-span-2" hint={t(M.eventForm.reminderHint)}>
            <div className="relative">
              <BellRing className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
              <Input
                value={form.reminder}
                onChange={(event) => set("reminder", event.target.value)}
                placeholder={t(M.eventForm.phReminder)}
                className="pe-9"
              />
            </div>
          </Field>

          <Field label={t(M.eventForm.note)} className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder={t(M.eventForm.phNote)}
            />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}

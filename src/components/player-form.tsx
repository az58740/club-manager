"use client";

import { useEffect, useState } from "react";
import { useClub } from "@/lib/store";
import type { Player, PlayerStatus, Position } from "@/lib/types";
import { PLAYER_STATUS_LABELS, POSITION_LABELS, SPORT_POSITIONS } from "@/lib/labels";
import { toDateInput } from "@/lib/date";
import { toman, uid } from "@/lib/format";
import { M, useT } from "@/lib/i18n/messages";
import { Button, Field, Input, JalaliDateInput, Segmented, Select, Sheet, Textarea } from "@/components/ui";

interface FormState {
  fullName: string;
  phone: string;
  teamId: string;
  position: Position;
  jersey: string;
  birthDate: string;
  heightCm: string;
  monthlyFee: string;
  status: PlayerStatus;
  insured: "yes" | "no";
  address: string;
  note: string;
}

function emptyForm(teamId = "", position: Position = "setter"): FormState {
  return {
    fullName: "",
    phone: "",
    teamId,
    position,
    jersey: "",
    birthDate: "",
    heightCm: "",
    monthlyFee: "",
    status: "active",
    insured: "no",
    address: "",
    note: "",
  };
}

export function PlayerFormSheet({
  open,
  onClose,
  player,
  defaultTeamId,
}: {
  open: boolean;
  onClose: () => void;
  player?: Player | null;
  defaultTeamId?: string;
}) {
  const { data, update, toast } = useClub();
  const t = useT();
  const sportPositions = SPORT_POSITIONS[data.club.sport];
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(defaultTeamId, sportPositions[0]),
  );

  useEffect(() => {
    if (!open) return;
    const fallbackPosition = SPORT_POSITIONS[data.club.sport][0];
    setForm(
      player
        ? {
            fullName: player.fullName,
            phone: player.phone,
            teamId: player.teamId,
            position: sportPositions.includes(player.position)
              ? player.position
              : fallbackPosition,
            jersey: String(player.jersey),
            birthDate: player.birthDate ? toDateInput(player.birthDate) : "",
            heightCm: String(player.heightCm || ""),
            monthlyFee: String(player.monthlyFee || ""),
            status: player.status,
            insured: player.insured ? "yes" : "no",
            address: player.address ?? "",
            note: player.note ?? "",
          }
        : emptyForm(defaultTeamId, fallbackPosition),
    );
  }, [open, player, defaultTeamId, data.club.sport, sportPositions]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.fullName.trim()) {
      toast(t(M.playerForm.errName), "error");
      return;
    }
    if (!form.teamId) {
      toast(t(M.playerForm.errTeam), "error");
      return;
    }
    const jersey = Number(form.jersey);
    if (!Number.isFinite(jersey) || jersey < 1 || jersey > 99) {
      toast(t(M.playerForm.errJersey), "error");
      return;
    }

    const payload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      teamId: form.teamId,
      position: form.position,
      jersey,
      birthDate: form.birthDate,
      heightCm: Number(form.heightCm) || 0,
      monthlyFee: Number(form.monthlyFee) || 0,
      status: form.status,
      insured: form.insured === "yes",
      address: form.address.trim() || undefined,
      note: form.note.trim() || undefined,
    };

    if (player) {
      update((current) => ({
        ...current,
        players: current.players.map((row) =>
          row.id === player.id ? { ...row, ...payload } : row,
        ),
      }));
      toast(t(M.playerForm.updated));
    } else {
      update((current) => ({
        ...current,
        players: [
          ...current.players,
          {
            id: uid("p"),
            joinedAt: new Date().toISOString(),
            ...payload,
          },
        ],
      }));
      toast(t(M.playerForm.added));
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(player ? M.playerForm.titleEdit : M.playerForm.titleNew)}
      description={t(player ? M.playerForm.descEdit : M.playerForm.descNew)}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="player-form" className="flex-1">
            {t(player ? M.form.save : M.players.addPlayer)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="player-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t(M.playerForm.fullName)} required className="sm:col-span-2">
          <Input
            value={form.fullName}
            onChange={(event) => set("fullName", event.target.value)}
            placeholder={t(M.playerForm.phFullName)}
            autoFocus
          />
        </Field>

        <Field label={t(M.playerForm.phone)}>
          <Input
            value={form.phone}
            onChange={(event) => set("phone", event.target.value)}
            placeholder={t(M.playerForm.phPhone)}
            dir="ltr"
            className="text-right ltr:text-left"
            inputMode="tel"
          />
        </Field>

        <Field label={t(M.login.team)} required>
          <Select value={form.teamId} onChange={(event) => set("teamId", event.target.value)}>
            <option value="">{t(M.form.selectTeam)}</option>
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} · {team.ageGroup}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t(M.playerForm.position)}>
          <Select
            value={form.position}
            onChange={(event) => set("position", event.target.value as Position)}
          >
            {sportPositions.map((position) => (
              <option key={position} value={position}>
                {POSITION_LABELS[position]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t(M.playerForm.jersey)} required>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={form.jersey}
            onChange={(event) => set("jersey", event.target.value)}
            placeholder={t(M.playerForm.phJersey)}
            dir="ltr"
            className="text-right ltr:text-left"
          />
        </Field>

        <Field label={t(M.playerForm.birthDate)}>
          <JalaliDateInput value={form.birthDate} onChange={(value) => set("birthDate", value)} />
        </Field>

        <Field label={t(M.playerForm.height)}>
          <Input
            type="number"
            inputMode="numeric"
            value={form.heightCm}
            onChange={(event) => set("heightCm", event.target.value)}
            placeholder={t(M.playerForm.phHeight)}
            dir="ltr"
            className="text-right ltr:text-left"
          />
        </Field>

        <Field
          label={t(M.playerForm.monthlyFee)}
          className="sm:col-span-2"
          hint={form.monthlyFee ? toman(Number(form.monthlyFee)) : t(M.playerForm.feeHint)}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={100000}
            value={form.monthlyFee}
            onChange={(event) => set("monthlyFee", event.target.value)}
            placeholder={t(M.playerForm.phFee)}
            dir="ltr"
            className="text-right ltr:text-left"
          />
        </Field>

        <Field label={t(M.playerForm.status)} className="sm:col-span-2">
          <Segmented<PlayerStatus>
            value={form.status}
            onChange={(value) => set("status", value)}
            options={(Object.keys(PLAYER_STATUS_LABELS) as PlayerStatus[]).map((status) => ({
              value: status,
              label: PLAYER_STATUS_LABELS[status],
            }))}
          />
        </Field>

        <Field
          label={t(M.playerForm.insurance)}
          className="sm:col-span-2"
          hint={
            form.insured === "yes"
              ? t(M.playerForm.insuredYes)
              : t(M.playerForm.insuredNo)
          }
        >
          <Segmented<"yes" | "no">
            value={form.insured}
            onChange={(value) => set("insured", value)}
            options={[
              { value: "yes", label: t(M.playerForm.hasInsurance) },
              { value: "no", label: t(M.playerForm.noInsurance) },
            ]}
          />
        </Field>

        <Field label={t(M.playerForm.address)} className="sm:col-span-2">
          <Textarea
            rows={2}
            value={form.address}
            onChange={(event) => set("address", event.target.value)}
            placeholder={t(M.playerForm.phAddress)}
          />
        </Field>

        <Field label={t(M.playerForm.note)} className="sm:col-span-2">
          <Textarea
            value={form.note}
            onChange={(event) => set("note", event.target.value)}
            placeholder={t(M.playerForm.phNote)}
          />
        </Field>
      </form>
    </Sheet>
  );
}

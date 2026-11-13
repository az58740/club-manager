"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { useClub } from "@/lib/store";
import type { ClubProfile, Sport } from "@/lib/types";
import { SPORT_LABELS, SPORT_ORDER } from "@/lib/labels";
import { Button, ClubLogo, Field, Input, Segmented, Sheet } from "@/components/ui";
import { M, tr, useT } from "@/lib/i18n/messages";

const MAX_LOGO_BYTES = 600 * 1024;

export function ClubProfileSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, update, setSport, toast } = useClub();
  const t = useT();
  const [form, setForm] = useState<ClubProfile>(data.club);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setForm(data.club);
  }, [open, data.club]);

  const set = <K extends keyof ClubProfile>(key: K, value: ClubProfile[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const pickLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast(tr(M.clubProfile.errNotImage), "error");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast(tr(M.clubProfile.errTooLarge), "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logo", String(reader.result));
    reader.onerror = () => toast(tr(M.clubProfile.errReadImage), "error");
    reader.readAsDataURL(file);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.shortName.trim()) {
      toast(tr(M.clubProfile.errNameRequired), "error");
      return;
    }

    const next: ClubProfile = {
      ...form,
      name: form.name.trim(),
      shortName: form.shortName.trim(),
      city: form.city.trim(),
      founded: form.founded.trim(),
      phone: form.phone.trim(),
      season: form.season.trim() || data.club.season,
    };

    if (next.sport !== data.club.sport) setSport(next.sport);
    update((current) => ({ ...current, club: next }));
    toast(t(M.clubProfile.saved));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(M.clubProfile.title)}
      description={t(M.clubProfile.subtitle)}
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="club-profile-form" className="flex-1">
            {t(M.form.save)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="club-profile-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-3.5">
            <ClubLogo logo={form.logo} className="h-16 w-16 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-ink">{t(M.ui.clubLogoAlt)}</p>
              <p className="mt-0.5 text-[10px] leading-5 text-muted">
                {t(M.clubProfile.logoHint)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  {t(M.clubProfile.chooseImage)}
                </Button>
                {form.logo ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => set("logo", undefined)}
                    className="text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t(M.clubProfile.removeLogo)}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={pickLogo}
          />
        </div>

        <Field label={t(M.clubProfile.nameLabel)} required className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder={t(M.clubProfile.phName)}
            autoFocus
          />
        </Field>

        <Field label={t(M.clubProfile.shortNameLabel)} required>
          <Input
            value={form.shortName}
            onChange={(event) => set("shortName", event.target.value)}
            placeholder={t(M.clubProfile.phShort)}
          />
        </Field>

        <Field label={t(M.clubProfile.seasonLabel)}>
          <Input
            value={form.season}
            onChange={(event) => set("season", event.target.value)}
            placeholder={t(M.clubProfile.phSeason)}
          />
        </Field>

        <Field
          label={t(M.clubProfile.sportLabel)}
          hint={t(M.clubProfile.sportHint)}
          className="sm:col-span-2"
        >
          <Segmented<Sport>
            value={form.sport}
            onChange={(value) => set("sport", value)}
            options={SPORT_ORDER.map((sport) => ({
              value: sport,
              label: SPORT_LABELS[sport],
            }))}
          />
        </Field>

        <Field label={t(M.clubProfile.cityLabel)}>
          <Input
            value={form.city}
            onChange={(event) => set("city", event.target.value)}
            placeholder={t(M.clubProfile.phCity)}
          />
        </Field>

        <Field label={t(M.clubProfile.foundedLabel)}>
          <Input
            value={form.founded}
            onChange={(event) => set("founded", event.target.value)}
            placeholder={t(M.clubProfile.phFounded)}
          />
        </Field>

        <Field label={t(M.clubProfile.phoneLabel)} className="sm:col-span-2">
          <Input
            value={form.phone}
            onChange={(event) => set("phone", event.target.value)}
            placeholder={t(M.clubProfile.phPhone)}
            dir="ltr"
            className="text-right ltr:text-left"
            inputMode="tel"
          />
        </Field>
      </form>
    </Sheet>
  );
}

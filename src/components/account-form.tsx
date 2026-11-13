"use client";

import { useEffect, useState } from "react";
import { Landmark, Wallet } from "lucide-react";
import { useClub } from "@/lib/store";
import { uid } from "@/lib/format";
import { ACCOUNT_KIND_LABELS } from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type { AccountKind, BankAccount } from "@/lib/types";
import {
  Button,
  Field,
  Input,
  Segmented,
  Sheet,
} from "@/components/ui";

export function AccountForm({
  open,
  onClose,
  account = null,
}: {
  open: boolean;
  onClose: () => void;
  account?: BankAccount | null;
}) {
  const { update, toast } = useClub();
  const t = useT();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("bank");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [iban, setIban] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setKind(account?.kind ?? "bank");
    setBankName(account?.bankName ?? "");
    setAccountNumber(account?.accountNumber ?? "");
    setCardNumber(account?.cardNumber ?? "");
    setIban(account?.iban ?? "");
    setOpeningBalance(String(account?.openingBalance ?? 0));
    setActive(account?.active ?? true);
  }, [open, account]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast(t(M.accounts.errName), "error");
      return;
    }
    const opening = Number(openingBalance);
    if (!Number.isFinite(opening) || opening < 0) {
      toast(t(M.accounts.errOpening), "error");
      return;
    }
    if (kind === "bank" && !bankName.trim()) {
      toast(t(M.accounts.errBankName), "error");
      return;
    }

    const payload: BankAccount = {
      id: account?.id ?? uid("acc"),
      name: name.trim(),
      kind,
      bankName: kind === "bank" ? bankName.trim() : undefined,
      accountNumber: kind === "bank" ? accountNumber.trim() || undefined : undefined,
      cardNumber: kind === "bank" ? cardNumber.replace(/\D/g, "") || undefined : undefined,
      iban: kind === "bank" ? iban.trim().toUpperCase() || undefined : undefined,
      openingBalance: opening,
      active,
    };

    update((current) => ({
      ...current,
      accounts: account
        ? current.accounts.map((row) => (row.id === account.id ? payload : row))
        : [...current.accounts, payload],
    }));
    toast(account ? t(M.accounts.editedToast) : t(M.accounts.createdToast));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={account ? t(M.accounts.titleEdit) : t(M.accounts.titleNew)}
      description={t(M.accounts.formSubtitle)}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="account-form" className="flex-1">
            {kind === "cash" ? <Wallet className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
            {account ? t(M.form.save) : t(M.accounts.createBtn)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="account-form" onSubmit={submit} className="space-y-4">
        <Segmented<AccountKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: "bank", label: ACCOUNT_KIND_LABELS.bank },
            { value: "cash", label: ACCOUNT_KIND_LABELS.cash },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(M.accounts.nameLabel)}>
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "bank" ? t(M.accounts.phNameBank) : t(M.accounts.phNameCash)}
            />
          </Field>
          <Field label={t(M.accounts.openingField)}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left font-bold"
            />
          </Field>
        </div>

        {kind === "bank" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(M.accounts.bankNameField)}>
              <Input
                required
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                placeholder={t(M.txForm.phBank)}
              />
            </Field>
            <Field label={t(M.accounts.accountNumberField)} hint={t(M.txForm.optional)}>
              <Input
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value)}
                dir="ltr"
                className="text-right ltr:text-left font-mono"
              />
            </Field>
            <Field label={t(M.accounts.cardNumberField)} hint={t(M.txForm.optional)}>
              <Input
                value={cardNumber}
                onChange={(event) => setCardNumber(event.target.value)}
                inputMode="numeric"
                maxLength={19}
                dir="ltr"
                placeholder="6104 **** **** ****"
                className="text-right ltr:text-left font-mono"
              />
            </Field>
            <Field label={t(M.accounts.ibanField)} hint={t(M.txForm.optional)}>
              <Input
                value={iban}
                onChange={(event) => setIban(event.target.value)}
                dir="ltr"
                placeholder="IR"
                className="text-right ltr:text-left font-mono"
              />
            </Field>
          </div>
        ) : null}

        <label className="flex items-center justify-between gap-3 rounded-2xl border border-line/80 bg-slate-50/70 px-3.5 py-3">
          <span>
            <span className="block text-[12px] font-semibold text-ink">{t(M.accounts.activeLabel)}</span>
            <span className="mt-0.5 block text-[10px] text-muted">{t(M.accounts.activeHint)}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive((value) => !value)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              active ? "bg-brand-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                active ? "end-0.5" : "end-[22px]"
              }`}
            />
          </button>
        </label>

        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-muted">
          {t(M.accounts.openingNote)}
        </p>
      </form>
    </Sheet>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useClub } from "@/lib/store";
import { combineDateTime, toDateInput } from "@/lib/date";
import { invoicePaidAmount } from "@/lib/selectors";
import { M, useT } from "@/lib/i18n/messages";
import type { Invoice, Player } from "@/lib/types";
import { uid } from "@/lib/format";
import { Button, Field, Input, JalaliDateInput, Sheet, Textarea } from "@/components/ui";

export function OpeningDebtSheet({
  player,
  invoice,
  open,
  onClose,
}: {
  player: Player;
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, update, toast } = useClub();
  const t = useT();
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => toDateInput(new Date()));
  const [note, setNote] = useState("");
  const [pendingSave, setPendingSave] = useState<{
    id: string;
    amount: number;
    dueAt: string;
    note?: string;
    isUpdate: boolean;
  } | null>(null);
  const submitLock = useRef(false);

  const paid = invoice ? invoicePaidAmount(invoice, data) : 0;

  useEffect(() => {
    if (!open) return;
    setAmount(invoice ? String(invoice.amount) : "");
    setDueDate(toDateInput(invoice?.dueAt ?? new Date()));
    setNote(invoice?.note ?? "");
    setPendingSave(null);
    submitLock.current = false;
    // Reset once per opening/player change; a new invoice may appear while the sheet is still open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, player.id]);

  useEffect(() => {
    if (!pendingSave) return;
    const timer = window.setTimeout(() => {
      const saved = data.invoices.find((row) => row.id === pendingSave.id);
      const hasPayment = data.payments.some((payment) => payment.invoiceId === pendingSave.id);
      if (
        saved?.kind === "opening_balance" &&
        saved.amount === pendingSave.amount &&
        saved.dueAt === pendingSave.dueAt &&
        saved.note === pendingSave.note &&
        !hasPayment
      ) {
        toast(t(pendingSave.isUpdate ? M.openingDebt.updated : M.openingDebt.recorded));
        onClose();
      } else {
        toast(t(M.openingDebt.saveConflict), "error");
      }
      setPendingSave(null);
      submitLock.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingSave, data.invoices, data.payments, onClose, t, toast]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;

    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0) {
      toast(t(M.openingDebt.invalidAmount), "error");
      return;
    }
    if (!dueDate) {
      toast(t(M.openingDebt.invalidDueDate), "error");
      return;
    }
    if (invoice && paid > 0) {
      toast(t(M.openingDebt.locked), "error");
      return;
    }

    const now = new Date().toISOString();
    const id = invoice?.id ?? uid("inv");
    const dueAt = combineDateTime(dueDate, "12:00");
    const normalizedNote = note.trim() || undefined;
    const nextInvoice: Invoice = {
      id,
      playerId: player.id,
      kind: "opening_balance",
      period: t(M.openingDebt.period),
      title: t(M.openingDebt.invoiceTitle),
      amount: value,
      dueAt,
      issuedAt: invoice?.issuedAt ?? now,
      note: normalizedNote,
    };

    submitLock.current = true;
    update((current) => {
      const currentInvoice = current.invoices.find(
        (row) => row.playerId === player.id && row.kind === "opening_balance",
      );
      if (
        currentInvoice &&
        current.payments.some((payment) => payment.invoiceId === currentInvoice.id)
      ) {
        return current;
      }
      const savedInvoice = {
        ...nextInvoice,
        id: currentInvoice?.id ?? nextInvoice.id,
        issuedAt: currentInvoice?.issuedAt ?? nextInvoice.issuedAt,
      };
      return {
        ...current,
        invoices: currentInvoice
          ? current.invoices.map((row) => (row.id === currentInvoice.id ? savedInvoice : row))
          : [...current.invoices, savedInvoice],
      };
    });
    setPendingSave({
      id,
      amount: value,
      dueAt,
      note: normalizedNote,
      isUpdate: Boolean(invoice),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(M.openingDebt.title)}
      description={t(M.openingDebt.description)}
      footer={
        <div className="flex gap-2">
          <Button
            type="submit"
            form="opening-debt-form"
            className="flex-1"
            disabled={paid > 0 || Boolean(pendingSave)}
          >
            {t(invoice ? M.openingDebt.update : M.openingDebt.save)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="opening-debt-form" onSubmit={submit} className="space-y-4">
        {paid > 0 ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
            {t(M.openingDebt.locked)}
          </p>
        ) : null}
        <Field label={t(M.openingDebt.amount)} hint={t(M.openingDebt.amountHint)} required>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            dir="ltr"
            className="text-right ltr:text-left text-base font-bold"
          />
        </Field>
        <Field label={t(M.openingDebt.dueDate)} required>
          <JalaliDateInput required value={dueDate} onChange={setDueDate} />
        </Field>
        <Field label={t(M.openingDebt.note)} hint={t(M.openingDebt.noteHint)}>
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}

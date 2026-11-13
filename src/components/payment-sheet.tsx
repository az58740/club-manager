"use client";

import { useEffect, useState } from "react";
import { useClub } from "@/lib/store";
import { combineDateTime, toDateInput } from "@/lib/date";
import { invoicePaidAmount, invoiceRemaining, playerById } from "@/lib/selectors";
import { accountName, defaultAccountId } from "@/lib/finance";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type { PaymentMethod } from "@/lib/types";
import { toman, uid } from "@/lib/format";
import { Button, Field, Input, JalaliDateInput, Select, Sheet } from "@/components/ui";

export function PaymentSheet({
  open,
  onClose,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string | null;
}) {
  const { data, update, toast } = useClub();
  const t = useT();
  const invoice = data.invoices.find((row) => row.id === invoiceId) ?? null;
  const player = invoice ? playerById(data, invoice.playerId) : undefined;
  const remaining = invoice ? invoiceRemaining(invoice, data) : 0;
  const paid = invoice ? invoicePaidAmount(invoice, data) : 0;

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [reference, setReference] = useState("");
  const accounts = data.accounts.filter((account) => account.active);

  useEffect(() => {
    if (!open || !invoice) return;
    setAmount(String(invoiceRemaining(invoice, data)));
    setMethod("card");
    setAccountId(defaultAccountId(data, "card"));
    setDate(toDateInput(new Date()));
    setReference("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!invoice) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast(t(M.payment.errAmount), "error");
      return;
    }
    if (value > remaining) {
      toast(t(M.payment.errOver, { amount: toman(remaining) }), "error");
      return;
    }
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    update((current) => ({
      ...current,
      payments: [
        ...current.payments,
        {
          id: uid("pay"),
          invoiceId: invoice.id,
          playerId: invoice.playerId,
          amount: value,
          paidAt: combineDateTime(date, time),
          method,
          accountId: accountId || undefined,
          reference: reference.trim() || undefined,
        },
      ],
    }));
    toast(t(M.payment.done, { amount: toman(value) }));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(M.payment.title)}
      description={invoice ? `${invoice.title} · ${player?.fullName ?? ""}` : undefined}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="payment-form" className="flex-1" disabled={!invoice || remaining <= 0}>
            {t(M.payment.submit)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      {!invoice ? (
        <p className="py-6 text-center text-sm text-muted">{t(M.payment.noInvoice)}</p>
      ) : (
        <form id="payment-form" onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center">
            <div>
              <p className="text-[10px] text-muted">{t(M.payment.invoiceAmount)}</p>
              <p className="mt-1 text-[12px] font-bold text-ink">{toman(invoice.amount)}</p>
            </div>
            <div className="border-x border-line">
              <p className="text-[10px] text-muted">{t(M.payment.paidWord)}</p>
              <p className="mt-1 text-[12px] font-bold text-emerald-600">{toman(paid)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted">{t(M.payment.remainingWord)}</p>
              <p className="mt-1 text-[12px] font-bold text-rose-600">{toman(remaining)}</p>
            </div>
          </div>

          <Field
            label={t(M.payment.amountField)}
            hint={
              remaining > 0
                ? t(M.payment.remainingHint, { amount: toman(remaining) })
                : t(M.payment.alreadySettled)
            }
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={remaining}
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left text-base font-bold"
              autoFocus
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(M.payment.method)}>
              <Select
                value={method}
                onChange={(event) => {
                  const nextMethod = event.target.value as PaymentMethod;
                  setMethod(nextMethod);
                  if (nextMethod !== "gateway") {
                    setAccountId(defaultAccountId(data, nextMethod));
                  }
                }}
              >
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[])
                  .filter((key) => key !== "gateway")
                  .map((key) => (
                    <option key={key} value={key}>
                      {PAYMENT_METHOD_LABELS[key]}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label={t(M.payment.date)}>
              <JalaliDateInput value={date} onChange={setDate} />
            </Field>
          </div>

          <Field label={t(M.payment.account)} hint={t(M.payment.accountHint)}>
            <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountName(account)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t(M.payment.reference)}>
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={t(M.payment.phReference)}
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>
        </form>
      )}
    </Sheet>
  );
}

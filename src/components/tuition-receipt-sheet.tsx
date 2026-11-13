"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useClub } from "@/lib/store";
import { addJalaliMonths, combineDateTime, daysFromNow, formatMonthYear, toDateInput } from "@/lib/date";
import { invoicePaidAmount, invoiceRemaining } from "@/lib/selectors";
import { accountName, defaultAccountId, normalizeInvoicePeriod } from "@/lib/finance";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type { Invoice, PaymentMethod, Player } from "@/lib/types";
import { toman, uid } from "@/lib/format";
import { Button, Card, Field, Input, JalaliDateInput, Select, Sheet } from "@/components/ui";

type CollectionType = "full" | "partial";

export function TuitionReceiptSheet({
  player,
  open,
  onClose,
}: {
  player: Player;
  open: boolean;
  onClose: () => void;
}) {
  const { data, update, toast } = useClub();
  const t = useT();
  const [period, setPeriod] = useState(() => formatMonthYear(new Date()));
  const [tuitionAmount, setTuitionAmount] = useState(String(player.monthlyFee));
  const [discountAmount, setDiscountAmount] = useState("0");
  const [collectionType, setCollectionType] = useState<CollectionType>("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [accountId, setAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => toDateInput(new Date()));
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<{ paymentId: string; period: string } | null>(null);
  const submitLock = useRef(false);

  const activeAccounts = data.accounts.filter((account) => account.active);
  const trimmedPeriod = period.trim();
  const periodOptions = useMemo(() => {
    const anchor = new Date();
    const generated = Array.from({ length: 25 }, (_, index) =>
      formatMonthYear(addJalaliMonths(anchor, index - 12)),
    );
    const existing = data.invoices
      .filter((invoice) => invoice.playerId === player.id && invoice.kind === "tuition")
      .map((invoice) => invoice.period);
    const unique = new Map<string, string>();
    for (const candidate of [...generated, ...existing]) {
      const key = normalizeInvoicePeriod(candidate);
      if (!unique.has(key)) unique.set(key, candidate);
    }
    return [...unique.values()];
  }, [data.invoices, player.id]);
  const existingInvoice =
    data.invoices.find(
      (invoice) =>
        invoice.playerId === player.id &&
        invoice.kind === "tuition" &&
        normalizeInvoicePeriod(invoice.period) === normalizeInvoicePeriod(trimmedPeriod),
    ) ?? null;
  const paidBefore = existingInvoice ? invoicePaidAmount(existingInvoice, data) : 0;
  const invoiceLocked = paidBefore > 0;
  const lockedInvoice = invoiceLocked ? existingInvoice : null;
  const parsedTuition = Number(tuitionAmount);
  const parsedDiscount = Number(discountAmount);
  const safeTuition = Number.isFinite(parsedTuition) ? Math.max(parsedTuition, 0) : 0;
  const safeDiscount = Number.isFinite(parsedDiscount) ? Math.max(parsedDiscount, 0) : 0;
  const invoiceTotal = lockedInvoice
    ? lockedInvoice.amount
    : Math.max(safeTuition - safeDiscount, 0);
  const balanceBefore = lockedInvoice
    ? invoiceRemaining(lockedInvoice, data)
    : invoiceTotal;
  const amountToReceive =
    collectionType === "full" ? balanceBefore : Number(partialAmount) || 0;
  const balanceAfter = Math.max(balanceBefore - amountToReceive, 0);

  useEffect(() => {
    if (!open) return;
    setPeriod(formatMonthYear(new Date()));
    setCollectionType("full");
    setPartialAmount("");
    setMethod("card");
    setAccountId(defaultAccountId(data, "card"));
    setPaymentDate(toDateInput(new Date()));
    setReference("");
    setSubmitting(false);
    submitLock.current = false;
    setPendingReceipt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, player.id]);

  useEffect(() => {
    if (!open) return;
    if (existingInvoice) {
      setTuitionAmount(String(existingInvoice.subtotal ?? existingInvoice.amount));
      setDiscountAmount(String(existingInvoice.discountAmount ?? 0));
    } else {
      setTuitionAmount(String(player.monthlyFee));
      setDiscountAmount("0");
    }
    setCollectionType("full");
    setPartialAmount("");
    // The fields should reset when the selected month changes, not on every data update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, player.id, trimmedPeriod]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || submitLock.current) return;

    if (!trimmedPeriod) {
      toast(t(M.finance.errPeriod), "error");
      return;
    }
    if (!invoiceLocked && (!Number.isInteger(parsedTuition) || parsedTuition <= 0)) {
      toast(t(M.payment.invalidTuitionAmount), "error");
      return;
    }
    if (
      !invoiceLocked &&
      (!Number.isInteger(parsedDiscount) || parsedDiscount < 0 || parsedDiscount >= parsedTuition)
    ) {
      toast(t(M.payment.invalidDiscount), "error");
      return;
    }
    if (balanceBefore <= 0) {
      toast(t(M.payment.invoiceAlreadyPaid), "error");
      return;
    }
    if (!Number.isInteger(amountToReceive) || amountToReceive <= 0) {
      toast(t(M.payment.errAmount), "error");
      return;
    }
    if (amountToReceive > balanceBefore) {
      toast(t(M.payment.errOver, { amount: toman(balanceBefore) }), "error");
      return;
    }

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const paymentId = uid("pay");
    const newInvoiceId = uid("inv");
    const newInvoice: Invoice = {
      id: newInvoiceId,
      playerId: player.id,
      kind: "tuition",
      period: trimmedPeriod,
      title: `${t(M.emza.invoiceTuitionTitle)} ${trimmedPeriod}`,
      subtotal: safeTuition,
      discountAmount: safeDiscount,
      amount: invoiceTotal,
      dueAt: daysFromNow(9, 12),
      issuedAt: now.toISOString(),
    };
    const paidAt = combineDateTime(paymentDate, time);

    submitLock.current = true;
    setSubmitting(true);
    update((current) => {
      const currentInvoice = current.invoices.find(
        (invoice) =>
          invoice.playerId === player.id &&
          invoice.kind === "tuition" &&
          normalizeInvoicePeriod(invoice.period) === normalizeInvoicePeriod(trimmedPeriod),
      );
      const currentPaid = currentInvoice
        ? current.payments
            .filter((payment) => payment.invoiceId === currentInvoice.id)
            .reduce((sum, payment) => sum + payment.amount, 0)
        : 0;
      const invoiceToSave = currentInvoice
        ? currentPaid > 0
          ? currentInvoice
          : {
              ...currentInvoice,
              subtotal: safeTuition,
              discountAmount: safeDiscount,
              amount: invoiceTotal,
            }
        : newInvoice;
      const currentBalance = Math.max(invoiceToSave.amount - currentPaid, 0);
      if (amountToReceive > currentBalance || currentBalance <= 0) return current;

      const invoices = currentInvoice
        ? current.invoices.map((invoice) =>
            invoice.id === currentInvoice.id ? invoiceToSave : invoice,
          )
        : [...current.invoices, invoiceToSave];

      return {
        ...current,
        invoices,
        payments: [
          ...current.payments,
          {
            id: paymentId,
            invoiceId: invoiceToSave.id,
            playerId: player.id,
            amount: amountToReceive,
            paidAt,
            method,
            accountId: accountId || undefined,
            reference: reference.trim() || undefined,
          },
        ],
      };
    });

    setPendingReceipt({ paymentId, period: trimmedPeriod });
  };

  useEffect(() => {
    if (!pendingReceipt) return;
    const timer = window.setTimeout(() => {
      const savedPayment = data.payments.find((payment) => payment.id === pendingReceipt.paymentId);
      if (savedPayment) {
        toast(
          t(M.payment.tuitionReceiptDone, {
            period: pendingReceipt.period,
            amount: toman(savedPayment.amount),
          }),
        );
        setPendingReceipt(null);
        setSubmitting(false);
        submitLock.current = false;
        onClose();
      } else {
        toast(t(M.payment.receiptConflict), "error");
        setPendingReceipt(null);
        setSubmitting(false);
        submitLock.current = false;
      }
    }, 50);
    return () => window.clearTimeout(timer);
  }, [data.payments, onClose, pendingReceipt, t, toast]);

  return (
    <Sheet
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={t(M.payment.receiptTitle)}
      description={`${player.fullName} · ${t(M.payment.receiptDescription)}`}
      footer={
        <div className="flex gap-2">
          <Button
            type="submit"
            form="tuition-receipt-form"
            className="flex-1"
            disabled={submitting}
          >
            {t(submitting ? M.payment.processingReceipt : M.payment.submitTuitionReceipt)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28" disabled={submitting}>
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="tuition-receipt-form" onSubmit={submit} className="space-y-4">
        <Field label={t(M.finance.periodField)} hint={t(M.payment.periodHint)}>
          <>
            <Input
              list={`tuition-period-options-${player.id}`}
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              placeholder={t(M.finance.phPeriod)}
              autoComplete="off"
            />
            <datalist id={`tuition-period-options-${player.id}`}>
              {periodOptions.map((option) => <option key={option} value={option} />)}
            </datalist>
          </>
        </Field>

        {existingInvoice ? (
          <div className="rounded-xl bg-brand-50 px-3 py-2 text-[11px] leading-5 text-brand-700">
            {t(M.payment.existingInvoiceHint, { amount: toman(existingInvoice.amount) })}
            {invoiceLocked ? <p className="mt-1">{t(M.payment.existingInvoiceLocked)}</p> : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t(M.payment.tuitionAmountField)}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={tuitionAmount}
              onChange={(event) => setTuitionAmount(event.target.value)}
              disabled={invoiceLocked}
              dir="ltr"
              className="text-right text-base font-semibold ltr:text-left"
            />
          </Field>
          <Field label={t(M.payment.discountField)} hint={t(M.payment.discountHint)}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={safeTuition}
              step={1}
              value={discountAmount}
              onChange={(event) => setDiscountAmount(event.target.value)}
              disabled={invoiceLocked}
              dir="ltr"
              className="text-right text-base font-semibold ltr:text-left"
            />
          </Field>
        </div>

        <Card className="space-y-2.5 bg-slate-50 p-3.5 ring-0 shadow-none">
          <div className="flex justify-between gap-3 text-[11px]">
            <span className="text-muted">{t(M.payment.tuitionSubtotal)}</span>
            <span className="font-semibold text-ink">{toman(lockedInvoice ? lockedInvoice.subtotal ?? lockedInvoice.amount : safeTuition)}</span>
          </div>
          {(lockedInvoice ? lockedInvoice.discountAmount ?? 0 : safeDiscount) > 0 ? (
            <div className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted">{t(M.payment.discountWord)}</span>
              <span className="font-semibold text-rose-600">
                −{toman(lockedInvoice ? lockedInvoice.discountAmount ?? 0 : safeDiscount)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-line pt-2 text-[11px]">
            <span className="font-semibold text-ink">{t(M.payment.netTuition)}</span>
            <span className="font-extrabold text-ink">{toman(invoiceTotal)}</span>
          </div>
          {paidBefore > 0 ? (
            <div className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted">{t(M.payment.previouslyPaid)}</span>
              <span className="font-semibold text-emerald-700">{toman(paidBefore)}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 text-[11px]">
            <span className="text-muted">{t(M.payment.remainingWord)}</span>
            <span className="font-semibold text-rose-600">{toman(balanceBefore)}</span>
          </div>
          <div className="flex justify-between gap-3 text-[11px]">
            <span className="text-muted">{t(M.payment.partialAmountField)}</span>
            <span className="font-semibold text-emerald-700">{toman(amountToReceive)}</span>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-2 text-[11px]">
            <span className="font-semibold text-ink">{t(M.payment.remainingAfter)}</span>
            <span className="font-extrabold text-ink">{toman(balanceAfter)}</span>
          </div>
        </Card>

        <Field label={t(M.payment.collectionType)}>
          <Select
            value={collectionType}
            onChange={(event) => setCollectionType(event.target.value as CollectionType)}
          >
            <option value="full">{t(M.payment.fullCollection)}</option>
            <option value="partial">{t(M.payment.partialCollection)}</option>
          </Select>
        </Field>

        {collectionType === "partial" ? (
          <Field label={t(M.payment.partialAmountField)} hint={t(M.payment.remainingHint, { amount: toman(balanceBefore) })}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={balanceBefore}
              step={1}
              value={partialAmount}
              onChange={(event) => setPartialAmount(event.target.value)}
              dir="ltr"
              className="text-right text-base font-bold ltr:text-left"
            />
          </Field>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t(M.payment.method)}>
            <Select
              value={method}
              onChange={(event) => {
                const nextMethod = event.target.value as PaymentMethod;
                setMethod(nextMethod);
                if (nextMethod !== "gateway") setAccountId(defaultAccountId(data, nextMethod));
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
            <JalaliDateInput value={paymentDate} onChange={setPaymentDate} />
          </Field>
        </div>

        <Field label={t(M.payment.account)} hint={t(M.payment.accountHint)}>
          <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {activeAccounts.map((account) => (
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
    </Sheet>
  );
}

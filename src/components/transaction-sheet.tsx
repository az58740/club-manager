"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react";
import { useClub } from "@/lib/store";
import { toDateInput, combineDateTime } from "@/lib/date";
import { defaultAccountId } from "@/lib/finance";
import {
  CHEQUE_STATUS_LABELS,
  LEDGER_METHOD_LABELS,
  TRANSACTION_KIND_LABELS,
} from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type {
  ChequeStatus,
  LedgerEntry,
  LedgerMethod,
  TransactionKind,
} from "@/lib/types";
import { uid } from "@/lib/format";
import {
  Button,
  Field,
  Input,
  JalaliDateInput,
  Segmented,
  Select,
  Sheet,
  Textarea,
} from "@/components/ui";

export function TransactionSheet({
  open,
  onClose,
  entry = null,
  initialKind = "expense",
  initialMethod = "card",
}: {
  open: boolean;
  onClose: () => void;
  entry?: LedgerEntry | null;
  initialKind?: TransactionKind;
  initialMethod?: LedgerMethod;
}) {
  const { data, update, toast } = useClub();
  const t = useT();

  const [kind, setKind] = useState<TransactionKind>(initialKind);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState<LedgerMethod>(initialMethod);
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [party, setParty] = useState("");
  const [note, setNote] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDue, setChequeDue] = useState(() => {
    const next = new Date();
    next.setDate(next.getDate() + 30);
    return toDateInput(next);
  });
  const [chequeStatus, setChequeStatus] = useState<ChequeStatus>("pending");

  useEffect(() => {
    if (!open) return;
    const nextKind = entry?.kind ?? initialKind;
    const nextMethod = entry?.method ?? initialMethod;
    const categories = data.categories.filter((category) => category.kind === nextKind);
    setKind(nextKind);
    setTitle(entry?.title ?? "");
    setAmount(entry ? String(entry.amount) : "");
    setCategoryId(entry?.categoryId ?? categories[0]?.id ?? "");
    setAccountId(entry?.accountId ?? defaultAccountId(data, nextMethod));
    setMethod(nextMethod);
    setDate(toDateInput(entry?.date ?? new Date()));
    setParty(entry?.party ?? "");
    setNote(entry?.note ?? "");
    setChequeNumber(entry?.cheque?.number ?? "");
    setChequeBank(entry?.cheque?.bank ?? "");
    setChequeDue(entry?.cheque?.dueAt ? toDateInput(entry.cheque.dueAt) : (() => {
      const next = new Date();
      next.setDate(next.getDate() + 30);
      return toDateInput(next);
    })());
    setChequeStatus(entry?.cheque?.status ?? "pending");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry, initialKind, initialMethod]);

  const categories = data.categories.filter((category) => category.kind === kind);
  const accounts = data.accounts.filter((account) => account.active);

  const changeKind = (nextKind: TransactionKind) => {
    setKind(nextKind);
    const first = data.categories.find((category) => category.kind === nextKind);
    setCategoryId(first?.id ?? "");
  };

  const changeMethod = (nextMethod: LedgerMethod) => {
    setMethod(nextMethod);
    setAccountId(defaultAccountId(data, nextMethod));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!title.trim()) {
      toast(t(M.txForm.errTitle), "error");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast(t(M.txForm.errAmount), "error");
      return;
    }
    if (!categoryId) {
      toast(t(M.txForm.errCategory), "error");
      return;
    }
    if (!accountId) {
      toast(t(M.txForm.errAccount), "error");
      return;
    }
    if (method === "cheque" && (!chequeNumber.trim() || !chequeBank.trim() || !chequeDue)) {
      toast(t(M.txForm.errCheque), "error");
      return;
    }

    const now = new Date();
    const dateTime = combineDateTime(
      date,
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );

    const payload: LedgerEntry = {
      id: entry?.id ?? uid("txn"),
      kind,
      categoryId,
      accountId,
      amount: value,
      method,
      date: dateTime,
      title: title.trim(),
      party: party.trim() || undefined,
      source: "manual",
      note: note.trim() || undefined,
      cheque:
        method === "cheque"
          ? {
              number: chequeNumber.trim(),
              bank: chequeBank.trim(),
              dueAt: combineDateTime(chequeDue, "12:00"),
              status: chequeStatus,
            }
          : undefined,
      createdAt: entry?.createdAt ?? new Date().toISOString(),
    };

    update((current) => ({
      ...current,
      transactions: entry
        ? current.transactions.map((row) => (row.id === entry.id ? payload : row))
        : [...current.transactions, payload],
    }));
    toast(entry ? t(M.txForm.edited) : t(M.txForm.recorded));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={entry ? t(M.txForm.titleEdit) : t(M.txForm.titleNew)}
      description={t(M.txForm.subtitle)}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="ledger-form" className="flex-1">
            {kind === "income" ? (
              <ArrowDownLeft className="h-4 w-4" />
            ) : (
              <ArrowUpRight className="h-4 w-4" />
            )}
            {entry ? t(M.form.save) : t(M.txForm.submitNew, { kind: TRANSACTION_KIND_LABELS[kind] })}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="ledger-form" onSubmit={submit} className="space-y-4">
        <Segmented<TransactionKind>
          value={kind}
          onChange={changeKind}
          options={[
            { value: "income", label: TRANSACTION_KIND_LABELS.income },
            { value: "expense", label: TRANSACTION_KIND_LABELS.expense },
          ]}
        />

        <Field label={t(M.txForm.descLabel)}>
          <Input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={kind === "income" ? t(M.txForm.phIncome) : t(M.txForm.phExpense)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(M.txForm.amountToman)}>
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
          <Field label={t(M.ledger.descCategory)}>
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(M.payment.method)}>
            <Select
              value={method}
              onChange={(event) => changeMethod(event.target.value as LedgerMethod)}
            >
              {(Object.keys(LEDGER_METHOD_LABELS) as LedgerMethod[]).map((key) => (
                <option key={key} value={key}>
                  {LEDGER_METHOD_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t(M.txForm.account)}>
            <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.kind === "bank" && account.bankName
                    ? `${account.name} · ${account.bankName}`
                    : account.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(M.txForm.dateLabel)}>
            <JalaliDateInput value={date} onChange={setDate} />
          </Field>
          <Field label={t(M.ledger.party)} hint={t(M.txForm.optional)}>
            <Input
              value={party}
              onChange={(event) => setParty(event.target.value)}
              placeholder={t(M.txForm.phParty)}
            />
          </Field>
        </div>

        {method === "cheque" ? (
          <div className="space-y-3 rounded-2xl border border-line/80 bg-slate-50/70 p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-ink">
              <Landmark className="h-4 w-4 text-brand-600" />
              {t(M.txForm.chequeDetails)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t(M.ledger.chequeNumber)}>
                <Input
                  required
                  value={chequeNumber}
                  onChange={(event) => setChequeNumber(event.target.value)}
                  dir="ltr"
                  className="text-right ltr:text-left font-mono"
                />
              </Field>
              <Field label={t(M.txForm.issuingBank)}>
                <Input
                  required
                  value={chequeBank}
                  onChange={(event) => setChequeBank(event.target.value)}
                  placeholder={t(M.txForm.phBank)}
                />
              </Field>
              <Field label={t(M.txForm.chequeDue)}>
                <JalaliDateInput required value={chequeDue} onChange={setChequeDue} />
              </Field>
              <Field label={t(M.txForm.chequeStatus)}>
                <Select
                  value={chequeStatus}
                  onChange={(event) => setChequeStatus(event.target.value as ChequeStatus)}
                >
                  {(Object.keys(CHEQUE_STATUS_LABELS) as ChequeStatus[]).map((key) => (
                    <option key={key} value={key}>
                      {CHEQUE_STATUS_LABELS[key]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="text-[10px] leading-5 text-muted">
              {t(M.txForm.chequeNote)}
            </p>
          </div>
        ) : null}

        <Field label={t(M.ledger.note)} hint={t(M.txForm.optional)}>
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t(M.txForm.phNote)}
          />
        </Field>
      </form>
    </Sheet>
  );
}

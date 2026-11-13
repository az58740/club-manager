"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { useClub } from "@/lib/store";
import { combineDateTime, toDateInput } from "@/lib/date";
import { defaultAccountId } from "@/lib/finance";
import { faNum } from "@/lib/format";
import { CHEQUE_STATUS_LABELS, LEDGER_METHOD_LABELS } from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type { ChequeInfo, ChequeStatus, LedgerEntry, LedgerMethod } from "@/lib/types";
import { Button, Field, Input, JalaliDateInput, Select, Sheet } from "@/components/ui";

const COLLECT_METHODS: LedgerMethod[] = ["cash", "card", "transfer", "cheque"];

export function CollectSheet({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry: LedgerEntry | null;
}) {
  const { data, update, toast } = useClub();
  const t = useT();
  const [method, setMethod] = useState<LedgerMethod>("cash");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(() => toDateInput(new Date()));
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
    const nextMethod: LedgerMethod = "cash";
    setMethod(nextMethod);
    setAccountId(defaultAccountId(data, nextMethod));
    setDate(toDateInput(new Date()));
    setChequeNumber("");
    setChequeBank("");
    setChequeDue(() => {
      const next = new Date();
      next.setDate(next.getDate() + 30);
      return toDateInput(next);
    });
    setChequeStatus("pending");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const changeMethod = (nextMethod: LedgerMethod) => {
    setMethod(nextMethod);
    setAccountId(defaultAccountId(data, nextMethod));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!entry) return;
    if (method === "cheque" && (!chequeNumber.trim() || !chequeBank.trim() || !chequeDue)) {
      toast(t(M.txForm.errCheque), "error");
      return;
    }
    if (!accountId) {
      toast(t(M.txForm.errAccount), "error");
      return;
    }

    const now = new Date();
    const dateTime = combineDateTime(
      date,
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
    const cheque: ChequeInfo | undefined =
      method === "cheque"
        ? {
            number: chequeNumber.trim(),
            bank: chequeBank.trim(),
            dueAt: combineDateTime(chequeDue, "12:00"),
            status: chequeStatus,
          }
        : undefined;
    const settledAt = new Date().toISOString();

    update((current) => ({
      ...current,
      transactions: current.transactions.map((row) =>
        row.id === entry.id
          ? { ...row, method, accountId, cheque, settled: true, settledAt }
          : row,
      ),
      stockMovements: current.stockMovements.map((movement) =>
        movement.ledgerId === entry.id
          ? { ...movement, method, accountId, cheque }
          : movement,
      ),
    }));

    toast(
      method === "cheque" && chequeStatus === "pending"
        ? t(M.accounts.collectChequeToast)
        : t(M.accounts.collectDoneToast),
    );
    onClose();
  };

  const isCheque = method === "cheque";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(M.accounts.collectTitle)}
      description={entry ? `${entry.title} · ${entry.party ?? t(M.accounts.noParty)}` : undefined}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="collect-form" className="flex-1">
            {t(M.accounts.collectSubmit)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      {entry ? (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12px]">
          <span className="text-amber-800">{t(M.accounts.collectableAmount)}</span>
          <span className="font-extrabold text-amber-900">{faNum(entry.amount)} {t(M.common.tomanUnit)}</span>
        </div>
      ) : null}

      <form id="collect-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(M.accounts.collectMethod)}>
            <Select
              value={method}
              onChange={(event) => changeMethod(event.target.value as LedgerMethod)}
            >
              {COLLECT_METHODS.map((key) => (
                <option key={key} value={key}>
                  {LEDGER_METHOD_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t(M.txForm.account)}>
            <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {data.accounts
                .filter((account) => account.active)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                    {account.bankName ? ` · ${account.bankName}` : ""}
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <Field label={t(M.ledger.settledDate)}>
          <JalaliDateInput value={date} onChange={setDate} />
        </Field>

        {isCheque ? (
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
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}

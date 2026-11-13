"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useClub } from "@/lib/store";
import { allLedgerEntries } from "@/lib/finance";
import { faNum, uid } from "@/lib/format";
import { TRANSACTION_KIND_LABELS } from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type { FinanceCategory, TransactionKind } from "@/lib/types";
import {
  Badge,
  Button,
  Field,
  Input,
  Segmented,
  Sheet,
  cn,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function CategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, toast } = useClub();
  const t = useT();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [deleteTarget, setDeleteTarget] = useState<FinanceCategory | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setKind("expense");
    setDeleteTarget(null);
  }, [open]);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of allLedgerEntries(data)) {
      counts.set(entry.categoryId, (counts.get(entry.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast(t(M.catForm.errName), "error");
      return;
    }
    if (
      data.categories.some(
        (category) => category.name.trim() === trimmed && category.kind === kind,
      )
    ) {
      toast(t(M.catForm.errDuplicate), "error");
      return;
    }
    const category: FinanceCategory = { id: uid("cat"), name: trimmed, kind };
    update((current) => ({ ...current, categories: [...current.categories, category] }));
    setName("");
    toast(t(M.catForm.added));
  };

  const remove = () => {
    if (!deleteTarget) return;
    update((current) => ({
      ...current,
      categories: current.categories.filter((category) => category.id !== deleteTarget.id),
    }));
    toast(t(M.catForm.removed), "info");
    setDeleteTarget(null);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(M.catForm.title)}
      description={t(M.catForm.subtitle)}
      footer={
        <Button type="button" className="w-full" onClick={onClose}>
          {t(M.ui.close)}
        </Button>
      }
    >
      <form onSubmit={add} className="space-y-3 rounded-2xl border border-line/80 bg-slate-50/70 p-3.5">
        <p className="text-[11px] font-semibold text-ink">{t(M.catForm.newCategory)}</p>
        <Field label={t(M.catForm.nameLabel)}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t(M.catForm.phName)}
          />
        </Field>
        <Field label={t(M.catForm.typeLabel)}>
          <Segmented<TransactionKind>
            value={kind}
            onChange={setKind}
            options={[
              { value: "expense", label: TRANSACTION_KIND_LABELS.expense },
              { value: "income", label: TRANSACTION_KIND_LABELS.income },
            ]}
          />
        </Field>
        <Button type="submit" size="sm" className="w-full">
          <Plus className="h-3.5 w-3.5" />
          {t(M.catForm.addCategory)}
        </Button>
      </form>

      {(["income", "expense"] as TransactionKind[]).map((section) => {
        const rows = data.categories.filter((category) => category.kind === section);
        return (
          <div key={section} className="mt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold text-ink">{t(M.catForm.sectionsTitle, { kind: TRANSACTION_KIND_LABELS[section] })}</h3>
              <span className="text-[10px] text-muted">{t(M.finance.itemsCount, { count: faNum(rows.length) })}</span>
            </div>
            <div className="mt-2 divide-y divide-line/70 overflow-hidden rounded-2xl border border-line/70">
              {rows.map((category) => {
                const count = usage.get(category.id) ?? 0;
                return (
                  <div key={category.id} className="flex items-center gap-2 px-3 py-2.5">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        category.kind === "income" ? "bg-emerald-500" : "bg-rose-500",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-ink">{category.name}</p>
                      <p className="text-[9px] text-muted">
                        {count ? t(M.catForm.transactionsCount, { count: faNum(count) }) : t(M.catForm.noTransactions)}
                      </p>
                    </div>
                    {category.system ? <Badge tone="slate">{t(M.catForm.systemBadge)}</Badge> : null}
                    {!category.system ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(category)}
                        disabled={count > 0}
                        className="grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={t(M.catForm.deleteAria, { name: category.name })}
                        title={count > 0 ? t(M.catForm.hasTxHint) : t(M.catForm.deleteCategory)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title={t(M.catForm.deleteCategory)}
        description={deleteTarget ? t(M.catForm.confirmDesc, { name: deleteTarget.name }) : ""}
        confirmLabel={t(M.ledger.deleteWord)}
        danger
      />
    </Sheet>
  );
}

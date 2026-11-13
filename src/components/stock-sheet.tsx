"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowUpDown, CalendarClock, Landmark, PackagePlus } from "lucide-react";
import { useClub } from "@/lib/store";
import { combineDateTime, toDateInput } from "@/lib/date";
import { defaultAccountId, productPurchaseCategoryId, productSaleCategoryId } from "@/lib/finance";
import { faNum, uid } from "@/lib/format";
import {
  CHEQUE_STATUS_LABELS,
  LEDGER_METHOD_LABELS,
  PRODUCT_CATEGORY_LABELS,
  STOCK_MOVEMENT_LABELS,
} from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type {
  ChequeInfo,
  ChequeStatus,
  LedgerEntry,
  LedgerMethod,
  StockMovement,
} from "@/lib/types";
import {
  Badge,
  Button,
  Field,
  Input,
  JalaliDateInput,
  Segmented,
  Select,
  Sheet,
  Textarea,
  cn,
} from "@/components/ui";

export type StockMode = "purchase" | "sale" | "adjustment";
type AdjustDirection = "increase" | "decrease";

export function StockSheet({
  open,
  onClose,
  mode,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  mode: StockMode;
  productId?: string;
}) {
  const { data, update, toast } = useClub();
  const t = useT();

  const [selectedId, setSelectedId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [party, setParty] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState<LedgerMethod>(mode === "purchase" ? "transfer" : "cash");
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<AdjustDirection>("increase");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDue, setChequeDue] = useState(() => {
    const next = new Date();
    next.setDate(next.getDate() + 30);
    return toDateInput(next);
  });
  const [chequeStatus, setChequeStatus] = useState<ChequeStatus>("pending");

  const activeProducts = data.products.filter((product) => product.active);
  const product =
    data.products.find((row) => row.id === selectedId) ?? activeProducts[0];

  useEffect(() => {
    if (!open) return;
    const preferred =
      data.products.find((row) => row.id === productId && row.active) ?? activeProducts[0];
    const nextMethod: LedgerMethod = mode === "purchase" ? "transfer" : "cash";
    setSelectedId(preferred?.id ?? "");
    setQty("1");
    setUnitPrice(
      preferred
        ? String(mode === "purchase" ? preferred.costPrice : preferred.salePrice)
        : "",
    );
    setParty("");
    setPlayerId("");
    setMethod(nextMethod);
    setAccountId(defaultAccountId(data, nextMethod));
    setDate(toDateInput(new Date()));
    setNote("");
    setDirection("increase");
    setChequeNumber("");
    setChequeBank("");
    setChequeDue(() => {
      const next = new Date();
      next.setDate(next.getDate() + 30);
      return toDateInput(next);
    });
    setChequeStatus("pending");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, productId]);

  const changeProduct = (nextId: string) => {
    setSelectedId(nextId);
    const next = data.products.find((row) => row.id === nextId);
    if (!next) return;
    setUnitPrice(String(mode === "purchase" ? next.costPrice : next.salePrice));
  };

  const changeMethod = (nextMethod: LedgerMethod) => {
    setMethod(nextMethod);
    setAccountId(defaultAccountId(data, nextMethod));
  };

  const changePlayer = (nextPlayerId: string) => {
    setPlayerId(nextPlayerId);
    const player = data.players.find((row) => row.id === nextPlayerId);
    if (player) setParty(player.fullName);
  };

  const amount = (Number(qty) || 0) * (Number(unitPrice) || 0);
  const title =
    mode === "purchase"
      ? t(M.shop.purchaseEntryTitle, {
          qty: faNum(Number(qty) || 0),
          name: product?.name ?? t(M.shop.productWord),
        })
      : mode === "sale"
        ? t(M.shop.saleEntryTitle, {
            qty: faNum(Number(qty) || 0),
            name: product?.name ?? t(M.shop.productWord),
          })
        : t(M.shop.adjustEntryTitle, {
            direction: direction === "increase" ? t(M.shop.increaseWord) : t(M.shop.decreaseWord),
            name: product?.name ?? t(M.shop.productWord),
          });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!product) {
      toast(t(M.shop.errProduct), "error");
      return;
    }
    const quantity = Number(qty);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast(t(M.shop.errQty), "error");
      return;
    }
    const price = Number(unitPrice);
    if (mode !== "adjustment" && (!Number.isFinite(price) || price <= 0)) {
      toast(t(M.shop.errUnitPrice), "error");
      return;
    }
    if (mode === "sale" && quantity > product.stock) {
      toast(t(M.shop.errNotEnoughStock, { name: product.name, count: faNum(product.stock) }), "error");
      return;
    }
    if (mode === "adjustment" && direction === "decrease" && quantity > product.stock) {
      toast(t(M.shop.errCannotDecrease, { count: faNum(product.stock) }), "error");
      return;
    }
    if (mode !== "adjustment" && method !== "credit" && !accountId) {
      toast(t(M.txForm.errAccount), "error");
      return;
    }
    if (mode === "sale" && method === "credit" && !party.trim()) {
      toast(t(M.shop.errCreditParty), "error");
      return;
    }
    if (mode !== "adjustment" && method === "cheque" && (!chequeNumber.trim() || !chequeBank.trim() || !chequeDue)) {
      toast(t(M.txForm.errCheque), "error");
      return;
    }

    const now = new Date();
    const dateTime = combineDateTime(
      date,
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
    const cheque: ChequeInfo | undefined =
      mode !== "adjustment" && method === "cheque"
        ? {
            number: chequeNumber.trim(),
            bank: chequeBank.trim(),
            dueAt: combineDateTime(chequeDue, "12:00"),
            status: chequeStatus,
          }
        : undefined;

    const movementId = uid("mv");
    const ledgerId = mode === "adjustment" ? undefined : uid("txn");

    const movement: StockMovement = {
      id: movementId,
      productId: product.id,
      kind: mode,
      qty: mode === "adjustment" && direction === "decrease" ? -quantity : quantity,
      unitPrice: mode === "adjustment" ? product.costPrice : price,
      date: dateTime,
      party: party.trim() || undefined,
      accountId: mode === "adjustment" || method === "credit" ? undefined : accountId,
      method: mode === "adjustment" ? undefined : method,
      cheque,
      ledgerId,
      note: note.trim() || undefined,
    };

    const ledger: LedgerEntry | undefined = ledgerId
      ? {
          id: ledgerId,
          kind: mode === "purchase" ? "expense" : "income",
          categoryId:
            mode === "purchase" ? productPurchaseCategoryId(product) : productSaleCategoryId(product),
          accountId: method === "credit" ? "" : accountId,
          amount,
          method,
          date: dateTime,
          title,
          party: party.trim() || undefined,
          playerId: mode === "sale" && playerId ? playerId : undefined,
          source: mode === "purchase" ? "purchase" : "sale",
          refId: movementId,
          cheque,
          note: note.trim() || undefined,
          credit: method === "credit" ? true : undefined,
          settled: method === "credit" ? false : undefined,
          createdAt: new Date().toISOString(),
        }
      : undefined;

    update((current) => ({
      ...current,
      products: current.products.map((row) => {
        if (row.id !== product.id) return row;
        const nextStock =
          mode === "purchase"
            ? row.stock + quantity
            : mode === "sale"
              ? row.stock - quantity
              : direction === "increase"
                ? row.stock + quantity
                : row.stock - quantity;
        const nextCost =
          mode === "purchase" && row.stock + quantity > 0
            ? Math.round(
                (row.stock * row.costPrice + quantity * price) / (row.stock + quantity),
              )
            : row.costPrice;
        return { ...row, stock: nextStock, costPrice: nextCost };
      }),
      stockMovements: [movement, ...current.stockMovements],
      transactions: ledger ? [ledger, ...current.transactions] : current.transactions,
    }));

    toast(
      mode === "purchase"
        ? t(M.shop.purchaseToast)
        : mode === "sale"
          ? method === "credit"
            ? t(M.shop.creditSaleToast)
            : t(M.shop.saleToast)
          : t(M.shop.adjustToast),
    );
    onClose();
  };

  const chequeBlock = mode !== "adjustment" && method === "cheque";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === "purchase" ? t(M.shop.sheetTitlePurchase) : mode === "sale" ? t(M.shop.sheetTitleSale) : t(M.shop.adjustStock)}
      description={
        mode === "purchase"
          ? t(M.shop.sheetDescPurchase)
          : mode === "sale"
            ? t(M.shop.sheetDescSale)
            : t(M.shop.sheetDescAdjust)
      }
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="stock-form" className="flex-1">
            {mode === "purchase" ? (
              <PackagePlus className="h-4 w-4" />
            ) : mode === "sale" ? (
              <ArrowUpRight className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4" />
            )}
            {t(M.txForm.submitNew, { kind: STOCK_MOVEMENT_LABELS[mode] })}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="stock-form" onSubmit={submit} className="space-y-4">
        <Field label={t(M.shop.productField)}>
          <Select value={product?.id ?? ""} onChange={(event) => changeProduct(event.target.value)}>
            {activeProducts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.size ? ` · ${row.size}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        {product ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] text-muted">
            <Badge tone="slate">{PRODUCT_CATEGORY_LABELS[product.category]}</Badge>
            <span>
              {t(M.shop.currentStockLabel)}{" "}
              <span
                className={cn(
                  "font-bold",
                  product.stock <= 0
                    ? "text-rose-600"
                    : product.stock <= product.minStock
                      ? "text-amber-600"
                      : "text-ink",
                )}
              >
                {t(M.shop.qtyPcs, { count: faNum(product.stock) })}
              </span>
            </span>
            <span className="ms-auto">{t(M.shop.salePriceLabel)}: {faNum(product.salePrice)} {t(M.common.tomanUnit)}</span>
          </div>
        ) : (
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
            {t(M.shop.noProductsYet)}
          </p>
        )}

        {mode === "adjustment" ? (
          <Segmented<AdjustDirection>
            value={direction}
            onChange={setDirection}
            options={[
              { value: "increase", label: t(M.shop.increaseStock) },
              { value: "decrease", label: t(M.shop.decreaseStock) },
            ]}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(M.shop.qtyField)}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              value={qty}
              onChange={(event) => setQty(event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left font-bold"
            />
          </Field>
          <Field
            label={
              mode === "adjustment"
                ? t(M.shop.unitPriceAdjust)
                : mode === "purchase"
                  ? t(M.shop.unitPricePurchase)
                  : t(M.shop.unitPriceSale)
            }
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              required={mode !== "adjustment"}
              disabled={mode === "adjustment"}
              value={mode === "adjustment" ? String(product?.costPrice ?? "") : unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left font-bold disabled:bg-slate-100 disabled:text-muted"
            />
          </Field>
        </div>

        {mode !== "adjustment" ? (
          <div className="flex items-center justify-between rounded-xl bg-brand-50/70 px-3.5 py-2.5 text-[12px]">
            <span className="text-muted">{t(M.shop.totalAmount)}</span>
            <span className="font-extrabold text-brand-700">{faNum(amount)} {t(M.common.tomanUnit)}</span>
          </div>
        ) : null}

        {mode !== "adjustment" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t(M.payment.method)}>
                <Select
                  value={method}
                  onChange={(event) => changeMethod(event.target.value as LedgerMethod)}
                >
                  {(Object.keys(LEDGER_METHOD_LABELS) as LedgerMethod[])
                    .filter((key) => key !== "credit" || mode === "sale")
                    .map((key) => (
                      <option key={key} value={key}>
                        {LEDGER_METHOD_LABELS[key]}
                      </option>
                    ))}
                </Select>
              </Field>
              {method === "credit" ? (
                <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2.5 text-[10px] text-amber-800">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  {t(M.shop.creditNotice)}
                </div>
              ) : (
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
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t(M.ledger.descDate)}>
                <JalaliDateInput value={date} onChange={setDate} />
              </Field>
              <Field
                label={mode === "purchase" ? t(M.shop.supplier) : t(M.shop.customer)}
                hint={mode === "sale" && method === "credit" ? t(M.shop.requiredForCredit) : t(M.txForm.optional)}
              >
                <Input
                  value={party}
                  onChange={(event) => setParty(event.target.value)}
                  placeholder={mode === "purchase" ? t(M.shop.phSupplier) : t(M.shop.phCustomer)}
                />
              </Field>
              {mode === "sale" ? (
                <Field
                  label={t(M.shop.buyerPlayer)}
                  hint={
                    method === "credit" && playerId
                      ? t(M.shop.hintCreditDebt)
                      : t(M.shop.hintPlayerDebt)
                  }
                >
                  <Select value={playerId} onChange={(event) => changePlayer(event.target.value)}>
                    <option value="">{t(M.shop.outsideClub)}</option>
                    {data.players
                      .filter((row) => row.status !== "inactive")
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.fullName}
                        </option>
                      ))}
                  </Select>
                </Field>
              ) : null}
            </div>

            {chequeBlock ? (
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
          </>
        ) : null}

        <Field label={t(M.ledger.note)} hint={t(M.txForm.optional)}>
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={mode === "adjustment" ? t(M.shop.phAdjustNote) : t(M.txForm.phNote)}
          />
        </Field>

        {mode === "sale" ? (
          <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] text-muted">
            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
            {t(M.shop.autoLedgerNote)}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}

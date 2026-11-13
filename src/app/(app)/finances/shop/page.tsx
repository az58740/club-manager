"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Boxes,
  History,
  PackagePlus,
  Pencil,
  ShoppingBag,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { useClub } from "@/lib/store";
import {
  accountById,
  accountName,
  allLedgerEntries,
  countsInTotals,
  entriesInMonth,
  inventoryValue,
  lowStockProducts,
} from "@/lib/finance";
import { formatDateFull } from "@/lib/date";
import { compactToman, faNum, toman } from "@/lib/format";
import {
  CHEQUE_STATUS_LABELS,
  LEDGER_METHOD_LABELS,
  PRODUCT_CATEGORY_LABELS,
  STOCK_MOVEMENT_LABELS,
} from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type { Product, StockMovementKind } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  StatCard,
  cn,
} from "@/components/ui";
import { FinanceNav } from "@/components/finance-nav";
import { ProductForm } from "@/components/product-form";
import { StockSheet, type StockMode } from "@/components/stock-sheet";

type MovementFilter = "all" | StockMovementKind;

const movementTone = (kind: StockMovementKind) =>
  kind === "purchase" ? ("blue" as const) : kind === "sale" ? ("emerald" as const) : ("slate" as const);

export default function ShopPage() {
  const { data } = useClub();
  const t = useT();
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockMode, setStockMode] = useState<StockMode>("sale");
  const [stockProductId, setStockProductId] = useState<string | undefined>(undefined);
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");

  const now = new Date();
  const entries = useMemo(() => allLedgerEntries(data), [data]);
  const monthEntries = useMemo(
    () => entriesInMonth(entries, now).filter(countsInTotals),
    [entries],
  );

  const activeProducts = data.products.filter((product) => product.active);
  const stockValue = inventoryValue(activeProducts);
  const lowStock = lowStockProducts(data.products).filter((product) => product.active);
  const outOfStock = activeProducts.filter((product) => product.stock <= 0).length;

  const monthSales = monthEntries
    .filter((entry) => entry.source === "sale" && entry.kind === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const monthPurchases = monthEntries
    .filter((entry) => entry.source === "purchase" && entry.kind === "expense")
    .reduce((sum, entry) => sum + entry.amount, 0);

  const movements = useMemo(
    () =>
      [...data.stockMovements].sort(
        (a, b) => +new Date(b.date) - +new Date(a.date),
      ),
    [data.stockMovements],
  );
  const movementCounts = {
    all: movements.length,
    purchase: movements.filter((movement) => movement.kind === "purchase").length,
    sale: movements.filter((movement) => movement.kind === "sale").length,
    adjustment: movements.filter((movement) => movement.kind === "adjustment").length,
  };
  const filteredMovements = movements.filter((movement) =>
    movementFilter === "all" ? true : movement.kind === movementFilter,
  );

  const openStock = (mode: StockMode, productId?: string) => {
    setStockMode(mode);
    setStockProductId(productId);
    setStockOpen(true);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={t(M.shell.titleShop)}
        subtitle={t(M.shop.subtitle)}
        action={
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditProduct(null);
                setProductFormOpen(true);
              }}
              className="hidden sm:inline-flex"
            >
              <PackagePlus className="h-4 w-4" />
              {t(M.shop.newProduct)}
            </Button>
            <Button size="sm" onClick={() => openStock("sale")}>
              <ShoppingCart className="h-4 w-4" />
              {STOCK_MOVEMENT_LABELS.sale}
            </Button>
            <Button size="sm" variant="outline" onClick={() => openStock("purchase")}>
              <ShoppingBag className="h-4 w-4" />
              {STOCK_MOVEMENT_LABELS.purchase}
            </Button>
          </div>
        }
      />

      <FinanceNav />

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label={t(M.shop.stockValueCard)}
          value={compactToman(stockValue)}
          hint={t(M.shop.activeProductsCount, { count: faNum(activeProducts.length) })}
          icon={<Boxes className="h-4 w-4" />}
          tone="brand"
        />
        <StatCard
          label={t(M.shop.monthSales)}
          value={compactToman(monthSales)}
          hint={t(M.shop.salesRecorded, { count: faNum(monthEntries.filter((entry) => entry.source === "sale").length) })}
          icon={<ArrowUpRight className="h-4 w-4" />}
          tone="emerald"
        />
        <StatCard
          label={t(M.shop.monthPurchases)}
          value={compactToman(monthPurchases)}
          hint={t(M.shop.purchasesRecorded, { count: faNum(monthEntries.filter((entry) => entry.source === "purchase").length) })}
          icon={<ArrowDownLeft className="h-4 w-4" />}
          tone="rose"
        />
        <StatCard
          label={t(M.shop.lowStockCard)}
          value={faNum(lowStock.length)}
          hint={outOfStock ? t(M.shop.outOfStockCount, { count: faNum(outOfStock) }) : t(M.shop.lowStockWord)}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={lowStock.length ? "amber" : "emerald"}
        />
      </section>

      {lowStock.length ? (
        <Card className="flex flex-wrap items-center gap-2 border-amber-200/80 bg-amber-50/60 p-3.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <p className="text-[11px] font-medium text-amber-900">
            {t(M.shop.lowStockBanner, { count: faNum(lowStock.length) })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lowStock.slice(0, 4).map((product) => (
              <Badge key={product.id} tone="amber">
                {product.name} · {t(M.shop.qtyPcs, { count: faNum(product.stock) })}
              </Badge>
            ))}
            {lowStock.length > 4 ? <Badge tone="amber">+{faNum(lowStock.length - 4)}</Badge> : null}
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:gap-5">
        {data.products.map((product) => {
          const low = product.stock <= product.minStock;
          const empty = product.stock <= 0;
          return (
            <Card
              key={product.id}
              className={cn("overflow-hidden p-5", !product.active && "opacity-70")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <ShoppingBag className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-ink">{product.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge tone="slate">{PRODUCT_CATEGORY_LABELS[product.category]}</Badge>
                      {product.size ? <Badge tone="slate">{product.size}</Badge> : null}
                      {!product.active ? <Badge tone="rose">{t(M.accounts.inactiveBadge)}</Badge> : null}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openStock("adjustment", product.id)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-slate-100 hover:text-ink"
                    aria-label={t(M.shop.adjustStock)}
                    title={t(M.shop.adjustStock)}
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditProduct(product);
                      setProductFormOpen(true);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-slate-100 hover:text-ink"
                    aria-label={t(M.shop.editProduct)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3">
                <div>
                  <p className="text-[9px] text-muted">{t(M.shop.stockLabel)}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-[13px] font-extrabold",
                      empty ? "text-rose-600" : low ? "text-amber-600" : "text-ink",
                    )}
                  >
                    {t(M.shop.qtyPcs, { count: faNum(product.stock) })}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted">{t(M.shop.costLabel)}</p>
                  <p className="mt-0.5 text-[12px] font-bold text-ink-soft">
                    {compactToman(product.costPrice)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted">{t(M.shop.salePriceLabel)}</p>
                  <p className="mt-0.5 text-[12px] font-bold text-brand-700">
                    {compactToman(product.salePrice)}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted">
                <span>
                  {t(M.shop.stockValueLine, {
                    amount: compactToman(product.stock * product.costPrice),
                  })}
                  {product.sku ? ` · ${t(M.shop.skuCode, { sku: product.sku })}` : ""}
                </span>
                {empty ? (
                  <Badge tone="rose">{t(M.shop.outOfStockBadge)}</Badge>
                ) : low ? (
                  <Badge tone="amber">{t(M.shop.lowStockBadge)}</Badge>
                ) : (
                  <Badge tone="emerald">{t(M.shop.inStockBadge)}</Badge>
                )}
              </div>

              <div className="mt-3 flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 px-2.5 text-[11px]"
                  onClick={() => openStock("purchase", product.id)}
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  {t(M.shop.recordPurchase)}
                </Button>
                <Button
                  size="sm"
                  className="h-8 flex-1 px-2.5 text-[11px]"
                  disabled={empty || !product.active}
                  onClick={() => openStock("sale", product.id)}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  {t(M.shop.recordSale)}
                </Button>
              </div>
            </Card>
          );
        })}

        {!data.products.length ? (
          <Card className="p-5 sm:col-span-2">
            <EmptyState
              icon={<ShoppingBag className="h-5 w-5" />}
              title={t(M.shop.noProductsTitle)}
              description={t(M.shop.noProductsDesc)}
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setEditProduct(null);
                    setProductFormOpen(true);
                  }}
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  {t(M.shop.newProduct)}
                </Button>
              }
              className="border-0 bg-transparent"
            />
          </Card>
        ) : null}
      </section>

      <Card className="overflow-hidden">
        <div className="space-y-3 px-3.5 pt-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
                <History className="h-4 w-4 text-brand-600" />
                {t(M.shop.movementsTitle)}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted">{t(M.shop.movementsSubtitle)}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-[11px] sm:hidden"
              onClick={() => {
                setEditProduct(null);
                setProductFormOpen(true);
              }}
            >
              <PackagePlus className="h-3.5 w-3.5" />
              {t(M.shop.newProduct)}
            </Button>
          </div>

          <Segmented<MovementFilter>
            value={movementFilter}
            onChange={setMovementFilter}
            options={[
              { value: "all", label: t(M.form.all), count: movementCounts.all },
              { value: "purchase", label: STOCK_MOVEMENT_LABELS.purchase, count: movementCounts.purchase },
              { value: "sale", label: STOCK_MOVEMENT_LABELS.sale, count: movementCounts.sale },
              { value: "adjustment", label: t(M.shop.adjustWord), count: movementCounts.adjustment },
            ]}
          />
        </div>

        <div className="mt-3 divide-y divide-line/70">
          {filteredMovements.slice(0, 30).map((movement) => {
            const product = data.products.find((row) => row.id === movement.productId);
            const purchase = movement.kind === "purchase";
            const sale = movement.kind === "sale";
            const signedQty =
              movement.kind === "adjustment"
                ? movement.qty
                : sale
                  ? -movement.qty
                  : movement.qty;
            const total = Math.abs(movement.qty) * movement.unitPrice;
            const account = movement.accountId ? accountById(data, movement.accountId) : undefined;
            return (
              <div key={movement.id} className="flex items-center gap-3 px-3.5 py-3 sm:px-5">
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                    purchase
                      ? "bg-blue-50 text-blue-600"
                      : sale
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-500",
                  )}
                >
                  {purchase ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : sale ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowUpDown className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-[12px] font-semibold text-ink">
                      {product?.name ?? t(M.shop.deletedProduct)}
                    </p>
                    <Badge tone={movementTone(movement.kind)}>
                      {STOCK_MOVEMENT_LABELS[movement.kind]}
                    </Badge>
                    {movement.cheque ? (
                      <Badge
                        tone={
                          movement.cheque.status === "cleared"
                            ? "emerald"
                            : movement.cheque.status === "bounced"
                              ? "rose"
                              : "amber"
                        }
                      >
                        {t(M.ledger.chequeWord)} {CHEQUE_STATUS_LABELS[movement.cheque.status]}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted">
                    {t(M.shop.qtyTimesPrice, {
                      qty: faNum(Math.abs(movement.qty)),
                      price: toman(movement.unitPrice),
                    })}
                    {movement.party ? ` · ${movement.party}` : ""}
                    {movement.method ? ` · ${LEDGER_METHOD_LABELS[movement.method]}` : ""}
                    {account ? ` · ${accountName(account)}` : ""}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted">
                    {formatDateFull(movement.date)}
                    {movement.note ? ` · ${movement.note}` : ""}
                  </p>
                </div>

                <div className="shrink-0 text-end">
                  <p
                    className={cn(
                      "text-[12px] font-extrabold",
                      signedQty > 0 ? "text-emerald-600" : signedQty < 0 ? "text-rose-600" : "text-ink",
                    )}
                  >
                    {signedQty > 0 ? "+" : signedQty < 0 ? "−" : ""}
                    {faNum(Math.abs(signedQty))}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted">
                    {movement.kind === "adjustment" ? t(M.shop.unitWord) : toman(total)}
                  </p>
                </div>
              </div>
            );
          })}

          {!filteredMovements.length ? (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title={t(M.shop.noMovementsTitle)}
              description={
                movementFilter === "all" ? t(M.shop.noMovementsAll) : t(M.shop.noMovementsFiltered)
              }
              className="m-4 border-0 bg-transparent"
            />
          ) : null}
        </div>
      </Card>

      <ProductForm
        open={productFormOpen}
        onClose={() => setProductFormOpen(false)}
        product={editProduct}
      />
      <StockSheet
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        mode={stockMode}
        productId={stockProductId}
      />
    </div>
  );
}

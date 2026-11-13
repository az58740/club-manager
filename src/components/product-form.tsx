"use client";

import { useEffect, useState } from "react";
import { PackagePlus } from "lucide-react";
import { useClub } from "@/lib/store";
import { faNum, uid } from "@/lib/format";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/labels";
import { M, useT } from "@/lib/i18n/messages";
import type { Product, ProductCategory } from "@/lib/types";
import {
  Button,
  Field,
  Input,
  Select,
  Sheet,
} from "@/components/ui";

export function ProductForm({
  open,
  onClose,
  product = null,
}: {
  open: boolean;
  onClose: () => void;
  product?: Product | null;
}) {
  const { update, toast } = useClub();
  const t = useT();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("clothing");
  const [sku, setSku] = useState("");
  const [size, setSize] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? "");
    setCategory(product?.category ?? "clothing");
    setSku(product?.sku ?? "");
    setSize(product?.size ?? "");
    setCostPrice(product ? String(product.costPrice) : "");
    setSalePrice(product ? String(product.salePrice) : "");
    setStock("0");
    setMinStock(String(product?.minStock ?? 0));
    setActive(product?.active ?? true);
  }, [open, product]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast(t(M.shop.errName), "error");
      return;
    }
    const cost = Number(costPrice);
    const sale = Number(salePrice);
    const initialStock = Number(stock);
    const minimum = Number(minStock);
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(sale) || sale < 0) {
      toast(t(M.shop.errPrices), "error");
      return;
    }
    if (!Number.isInteger(initialStock) || initialStock < 0) {
      toast(t(M.shop.errStock), "error");
      return;
    }
    if (!Number.isInteger(minimum) || minimum < 0) {
      toast(t(M.shop.errMinStock), "error");
      return;
    }

    const payload: Product = {
      id: product?.id ?? uid("pr"),
      name: name.trim(),
      category,
      sku: sku.trim() || undefined,
      size: size.trim() || undefined,
      costPrice: cost,
      salePrice: sale,
      stock: product?.stock ?? initialStock,
      minStock: minimum,
      active,
    };

    update((current) => ({
      ...current,
      products: product
        ? current.products.map((row) => (row.id === product.id ? payload : row))
        : [...current.products, payload],
      stockMovements:
        !product && initialStock > 0
          ? [
              {
                id: uid("mv"),
                productId: payload.id,
                kind: "adjustment" as const,
                qty: initialStock,
                unitPrice: cost,
                date: new Date().toISOString(),
                note: t(M.shop.initialStockNote),
              },
              ...current.stockMovements,
            ]
          : current.stockMovements,
    }));
    toast(product ? t(M.shop.editedToast) : t(M.shop.createdToast));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={product ? t(M.shop.titleEdit) : t(M.shop.newProduct)}
      description={t(M.shop.formSubtitle)}
      footer={
        <div className="flex gap-2">
          <Button type="submit" form="product-form" className="flex-1">
            <PackagePlus className="h-4 w-4" />
            {product ? t(M.form.save) : t(M.shop.addProductBtn)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <form id="product-form" onSubmit={submit} className="space-y-4">
        <Field label={t(M.shop.nameLabel)}>
          <Input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t(M.shop.phName)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(M.shop.categoryField)}>
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value as ProductCategory)}
            >
              {(Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]).map((key) => (
                <option key={key} value={key}>
                  {PRODUCT_CATEGORY_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t(M.shop.sizeField)} hint={t(M.txForm.optional)}>
            <Input
              value={size}
              onChange={(event) => setSize(event.target.value)}
              placeholder={t(M.shop.phSize)}
            />
          </Field>
          <Field label={t(M.shop.skuField)} hint={t(M.txForm.optional)}>
            <Input
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              dir="ltr"
              placeholder="SKU-001"
              className="text-right ltr:text-left font-mono"
            />
          </Field>
          <Field label={t(M.shop.minStockField)}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={minStock}
              onChange={(event) => setMinStock(event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(M.shop.costField)}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              required
              value={costPrice}
              onChange={(event) => setCostPrice(event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left font-bold"
            />
          </Field>
          <Field label={t(M.shop.saleField)}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              required
              value={salePrice}
              onChange={(event) => setSalePrice(event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left font-bold"
            />
          </Field>
        </div>

        {!product ? (
          <Field label={t(M.shop.initialStockField)} hint={t(M.txForm.optional)}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              dir="ltr"
              className="text-right ltr:text-left"
            />
          </Field>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-muted">
            {t(M.shop.stockHint, { count: faNum(product.stock) })}
          </p>
        )}

        <label className="flex items-center justify-between gap-3 rounded-2xl border border-line/80 bg-slate-50/70 px-3.5 py-3">
          <span>
            <span className="block text-[12px] font-semibold text-ink">{t(M.shop.activeLabel)}</span>
            <span className="mt-0.5 block text-[10px] text-muted">{t(M.shop.activeHint)}</span>
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
      </form>
    </Sheet>
  );
}

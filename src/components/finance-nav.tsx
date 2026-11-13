"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, Landmark, ReceiptText, ShoppingBag } from "lucide-react";
import { M, useT, type Message } from "@/lib/i18n/messages";
import { cn } from "@/components/ui";

const tabs: Array<{ href: string; label: Message; icon: typeof ReceiptText }> = [
  { href: "/finances", label: M.finance.tabTuition, icon: ReceiptText },
  { href: "/finances/ledger", label: M.finance.tabLedger, icon: BookOpenCheck },
  { href: "/finances/accounts", label: M.finance.tabAccounts, icon: Landmark },
  { href: "/finances/shop", label: M.finance.tabShop, icon: ShoppingBag },
];

export function FinanceNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-line/70 bg-white p-1.5">
      {tabs.map((tab) => {
        const active = tab.href === "/finances" ? pathname === tab.href : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12px] font-medium transition",
              active
                ? "bg-brand-600 text-white shadow-sm"
                : "text-muted hover:bg-slate-50 hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}

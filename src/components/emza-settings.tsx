"use client";

import { useEffect, useState } from "react";
import { Mic, Sparkles } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { M, useT } from "@/lib/i18n/messages";

const ENABLED_KEY = "emza-agent-enabled-v1";

export function EmzaSettingsCard() {
  const t = useT();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(ENABLED_KEY);
    if (stored !== null) setEnabled(stored === "1");
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    window.localStorage.setItem(ENABLED_KEY, next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("emza-enabled", { detail: next }));
  };

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-night-800 text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-extrabold text-ink">{t(M.emzaUi.cardTitle)}</h2>
          <p className="mt-1 text-[11px] leading-6 text-muted">{t(M.emzaUi.cardBody)}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "relative h-7 w-12 rounded-full transition",
            enabled ? "bg-brand-600" : "bg-slate-300",
          )}
          role="switch"
          aria-checked={enabled}
          aria-label={t(M.emzaUi.enabledSwitchAria)}
        >
          <span
            className={cn(
              "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
              enabled ? "end-1" : "end-6",
            )}
          />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] text-muted">
        <Mic className="h-3.5 w-3.5" />
        {enabled ? t(M.emzaUi.statusEnabled) : t(M.emzaUi.statusDisabled)}
      </div>
    </Card>
  );
}

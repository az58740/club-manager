"use client";

import { Button, Sheet } from "@/components/ui";
import { M, useT } from "@/lib/i18n/messages";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const t = useT();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            className="flex-1"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel ?? t(M.form.confirm)}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="w-28">
            {t(M.form.cancel)}
          </Button>
        </div>
      }
    >
      <p className="text-[13px] leading-6 text-ink-soft">{description}</p>
    </Sheet>
  );
}

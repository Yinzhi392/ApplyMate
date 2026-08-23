import { useEffect, useRef } from "react";

import styles from "./Dialog.module.css";

interface DialogShellProps {
  children: React.ReactNode;
  label: string;
  onClose: () => void;
  variant?: "center" | "sheet";
}

export function DialogShell({ children, label, onClose, variant = "center" }: DialogShellProps): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      aria-label={label}
      className={`${styles.dialog} ${variant === "sheet" ? styles.sheet : styles.center}`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      ref={ref}
    >
      <div className={styles.panel}>{children}</div>
    </dialog>
  );
}

export function ConfirmDialog({
  cancelLabel = "取消",
  confirmLabel,
  destructive = false,
  detail,
  onCancel,
  onConfirm,
  title,
}: {
  cancelLabel?: string;
  confirmLabel: string;
  destructive?: boolean;
  detail: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}): React.JSX.Element {
  return (
    <DialogShell label={title} onClose={onCancel}>
      <h2>{title}</h2>
      <p>{detail}</p>
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={onCancel} type="button">{cancelLabel}</button>
        <button autoFocus className={destructive ? styles.danger : styles.primary} onClick={onConfirm} type="button">{confirmLabel}</button>
      </div>
    </DialogShell>
  );
}

export interface ActionSheetAction {
  destructive?: boolean;
  label: string;
  onSelect: () => void;
}

export function ActionSheet({ actions, onClose, title }: {
  actions: readonly ActionSheetAction[];
  onClose: () => void;
  title: string;
}): React.JSX.Element {
  return (
    <DialogShell label={title} onClose={onClose} variant="sheet">
      <h2>{title}</h2>
      <div className={styles.sheetActions}>
        {actions.map((action) => (
          <button
            className={action.destructive ? styles.sheetDanger : styles.sheetAction}
            key={action.label}
            onClick={() => { onClose(); action.onSelect(); }}
            type="button"
          >
            {action.label}
          </button>
        ))}
        <button className={styles.sheetCancel} onClick={onClose} type="button">取消</button>
      </div>
    </DialogShell>
  );
}

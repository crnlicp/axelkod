// Modal dialog on <dialog>: the browser handles the focus trap, inert background
// and Escape; we restore focus to the opener on close.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useAccT } from "../context";

export function Dialog({ open, onClose, title, children, wide, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const id = useId();
  const t = useAccT();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { opener.current = document.activeElement; d.showModal(); }
    if (!open && d.open) { d.close(); (opener.current as HTMLElement | null)?.focus?.(); }
  }, [open]);

  return (
    <dialog ref={ref} aria-labelledby={id} onCancel={(e) => { e.preventDefault(); onClose(); }}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl border border-border bg-[var(--bg-elev)] p-0 text-fg shadow-2xl backdrop:bg-black/50`}>
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <h2 id={id} className="text-xl">{title}</h2>
            <button type="button" onClick={onClose} aria-label={t.shell.close} className="-m-1 rounded p-1 text-2xl leading-none text-muted hover:text-fg">×</button>
          </div>
          <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-border px-5 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

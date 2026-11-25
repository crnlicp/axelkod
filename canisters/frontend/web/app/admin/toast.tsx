import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

export type Feedback = { ok: boolean; text: string } | null;
type Item = { id: number; source: string; ok: boolean; text: string };
type Push = (source: string, f: Feedback) => void;

const Ctx = createContext<Push>(() => {});

/** Admin feedback as toasts, bottom right. One toast per source, so "Publishing…" is replaced by its result. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const next = useRef(0);

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const push = useCallback<Push>((source, f) => {
    setItems((xs) => {
      for (const x of xs) if (x.source === source) { clearTimeout(timers.current.get(x.id)); timers.current.delete(x.id); }
      const rest = xs.filter((x) => x.source !== source);
      if (!f?.text) return rest;
      const id = next.current++;
      // Errors stay longer so they can be read; anything can be closed by hand.
      timers.current.set(id, setTimeout(() => dismiss(id), f.ok ? 5000 : 10000));
      return [...rest, { id, source, ok: f.ok, text: f.text }].slice(-4);
    });
  }, [dismiss]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96">
        {items.map((x) => (
          <div key={x.id} role="status" aria-live={x.ok ? "polite" : "assertive"}
            className={`toast pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-[var(--bg-elev)] p-4 text-sm shadow-xl ${x.ok ? "border-brand/50" : "border-[var(--error)]"}`}>
            <span aria-hidden="true" className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${x.ok ? "bg-brand" : "bg-[var(--error)]"}`} />
            <p className="flex-1 text-fg">{x.text}</p>
            <button type="button" aria-label="×" onClick={() => dismiss(x.id)} className="-m-1 rounded p-1 leading-none text-muted hover:text-fg">×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Shows `status` as a toast whenever it changes (a new object, even with the same text); null dismisses it. */
export function Toast({ status }: { status: Feedback }) {
  const push = useContext(Ctx);
  const source = useId();
  useEffect(() => push(source, status), [status, push, source]);
  return null;
}

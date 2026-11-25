// Account combobox (ARIA 1.2 pattern): type "19" or "bank" to get 1930 Företagskonto.
// Recently used accounts come first; inactive accounts are hidden.
import { useId, useMemo, useState } from "react";
import type { Account } from "../../../bindings/accounting";
import { useAcc } from "../context";

const RECENT = "axelkod:acc-recent";

function recent(): number[] {
  try { return JSON.parse(localStorage.getItem(RECENT) ?? "[]") as number[]; } catch { return []; }
}

export function rememberAccount(n: number) {
  try { localStorage.setItem(RECENT, JSON.stringify([n, ...recent().filter((x) => x !== n)].slice(0, 12))); } catch { /* convenience only */ }
}

export function AccountPicker({ value, onChange, labelText, id, invalid }: {
  value: bigint | null; onChange: (a: Account | null) => void; labelText: string; id?: string; invalid?: boolean;
}) {
  const { data, accountName } = useAcc();
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const shown = query ?? (value !== null ? `${value} ${accountName(value)}` : "");

  const options = useMemo(() => {
    const all = (data?.accounts ?? []).filter((a) => a.active);
    const q = (query ?? "").trim().toLowerCase();
    const r = recent();
    const rank = (a: Account) => { const i = r.indexOf(Number(a.number)); return i < 0 ? 99 : i; };
    const hits = q ? all.filter((a) => String(a.number).startsWith(q) || a.name.toLowerCase().includes(q)) : all;
    return [...hits].sort((a, b) => (q && /^\d/.test(q) ? 0 : rank(a) - rank(b)) || Number(a.number - b.number)).slice(0, 50);
  }, [data, query]);

  function choose(a: Account) {
    rememberAccount(Number(a.number));
    onChange(a);
    setQuery(null);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input id={id} role="combobox" aria-label={labelText} aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${options[active].number}` : undefined} aria-invalid={invalid || undefined}
        autoComplete="off" value={shown}
        className="w-full rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5 aria-[invalid]:border-[var(--error)]"
        onFocus={(e) => e.target.select()}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onBlur={() => { setTimeout(() => setOpen(false), 120); if (query !== null) { const exact = options.find((a) => String(a.number) === query.trim()); if (exact) choose(exact); else setQuery(null); } }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(options.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter" && open && options[active]) { e.preventDefault(); choose(options[active]); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); setQuery(null); }
        }} />
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" aria-label={labelText}
          className="absolute z-30 mt-1 max-h-64 w-full min-w-64 overflow-y-auto rounded-lg border border-border bg-[var(--bg-elev)] py-1 text-sm shadow-xl">
          {options.map((a, i) => (
            <li key={String(a.number)} id={`${listId}-${a.number}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(a); }}
              className="flex cursor-pointer gap-2 px-3 py-1.5 aria-selected:bg-[var(--brand-soft)]">
              <span className="font-mono">{String(a.number)}</span><span className="flex-1">{a.name}</span>
              {a.vatCode && <span className="text-xs text-muted">{a.vatCode}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

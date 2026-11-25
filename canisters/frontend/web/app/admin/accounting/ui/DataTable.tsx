// List-page table: sticky header, sortable columns (aria-sort), right-aligned
// amounts, row click/Enter to open, j/k to move, CSV of the current view, and
// cards instead of rows below md.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { saveFile } from "../pdf/client";
import { useAccT } from "../context";
import { IconDownload } from "../../../components/Icons";

export type Column<T> = {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
  /** Plain value for sorting and CSV; columns without it are not sortable. */
  value?: (row: T) => string | number | bigint;
  /** CSV text when it differs from the sort value (amounts as "1234,56"). */
  csv?: (row: T) => string;
  align?: "right";
  /** Hidden in the card layout below md. */
  secondary?: boolean;
};

const cmp = (a: string | number | bigint, b: string | number | bigint) =>
  typeof a === "string" || typeof b === "string" ? String(a).localeCompare(String(b), "sv") : a < b ? -1 : a > b ? 1 : 0;

const csvCell = (v: unknown) => {
  const s = typeof v === "bigint" ? v.toString() : String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function DataTable<T>({ rows, columns, rowKey, onOpen, caption, csvName, empty }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onOpen?: (r: T) => void;
  caption: string; csvName?: string; empty?: ReactNode;
}) {
  const t = useAccT();
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [active, setActive] = useState(-1);
  const body = useRef<HTMLTableSectionElement>(null);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.value || !sort) return rows;
    return [...rows].sort((a, b) => cmp(col.value!(a), col.value!(b)) * sort.dir);
  }, [rows, columns, sort]);

  useEffect(() => setActive(-1), [rows]);
  useEffect(() => {
    if (active >= 0) (body.current?.rows[active] as HTMLElement | undefined)?.focus();
  }, [active]);

  function onKey(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(sorted.length - 1, i + 1)); }
    if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter" && active >= 0 && onOpen) { e.preventDefault(); onOpen(sorted[active]); }
  }

  function exportCsv() {
    const cols = columns.filter((c) => c.value || c.csv);
    const lines = [cols.map((c) => csvCell(c.title)).join(";"), ...sorted.map((r) => cols.map((c) => csvCell((c.csv ?? c.value)!(r))).join(";"))];
    // BOM so spreadsheet programs read UTF-8; semicolons as Swedish Excel expects.
    saveFile(new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }), `${csvName ?? "export"}.csv`);
  }

  if (!rows.length && empty) return <>{empty}</>;

  return (
    <div onKeyDown={onKey}>
      {csvName && (
        <div className="mb-2 flex justify-end">
          <button type="button" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg" onClick={exportCsv}>
            <IconDownload className="h-4 w-4" /> {t.common.exportCsv}
          </button>
        </div>
      )}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-bg md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-[var(--bg-elev)]">
            <tr>
              {columns.map((c) => {
                const dir = sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined;
                return (
                  <th key={c.key} scope="col" aria-sort={c.value ? dir ?? "none" : undefined}
                    className={`border-b border-border px-3 py-2 font-semibold text-muted ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {c.value ? (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-fg" aria-label={t.common.sortBy(c.title)}
                        onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                        {c.title}<span aria-hidden="true">{dir === "ascending" ? "▲" : dir === "descending" ? "▼" : ""}</span>
                      </button>
                    ) : c.title}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody ref={body}>
            {sorted.map((r, i) => (
              <tr key={rowKey(r)} tabIndex={onOpen ? 0 : undefined} onFocus={() => setActive(i)}
                onClick={onOpen ? (e) => { if (!(e.target as HTMLElement).closest("a,button,input")) onOpen(r); } : undefined}
                className={`border-b border-border last:border-0 ${onOpen ? "cursor-pointer hover:bg-surface-strong focus:bg-surface-strong focus:outline-2 focus:-outline-offset-2 focus:outline-accent" : ""}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 align-top ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden" aria-label={caption}>
        {sorted.map((r) => (
          <li key={rowKey(r)}>
            <div role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen ? () => onOpen(r) : undefined}
              onKeyDown={onOpen ? (e) => { if (e.key === "Enter") onOpen(r); } : undefined}
              className="rounded-xl border border-border bg-bg p-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {columns.filter((c) => !c.secondary).map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-muted">{c.title}</dt>
                    <dd className={c.align === "right" ? "text-right tabular-nums" : ""}>{c.render(r)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

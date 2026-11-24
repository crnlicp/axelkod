import { useCallback, useEffect, useState } from "react";
import { Area, Status, type Message, type MessagePage } from "../../bindings/backend";
import { useAdmin } from "../../admin/session";

const PAGE = 25;
const statusLabel: Record<Status, string> = { [Status.new]: "Ny", [Status.read]: "Läst", [Status.handled]: "Hanterad" };
const areaLabel: Record<Area, string> = {
  [Area.parts]: "Fordonsdelar", [Area.software]: "Mjukvara", [Area.security]: "Cybersäkerhet", [Area.other]: "Annat",
};
const filters: Array<{ key: Status | "all"; label: string }> = [
  { key: "all", label: "Alla" }, { key: Status.new, label: "Nya" }, { key: Status.read, label: "Lästa" }, { key: Status.handled, label: "Hanterade" },
];

const date = (ns: bigint) =>
  new Date(Number(ns / 1_000_000n)).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export default function Inbox() {
  const { actor, setUnread } = useAdmin();
  const [filter, setFilter] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<MessagePage | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const res = await actor.listMessages(
        { status: filter === "all" ? undefined : filter, search: query || undefined },
        { offset: BigInt(offset), limit: BigInt(PAGE) },
      );
      if (res.__kind__ === "err") throw new Error(res.err.__kind__);
      setPage(res.ok);
      setUnread(Number(res.ok.unread));
      setError("");
      return res.ok;
    } catch (e) {
      setError(`Kunde inte hämta meddelanden: ${errText(e)}`);
      return null;
    }
  }, [actor, filter, query, offset, setUnread]);

  useEffect(() => { void load(); }, [load]);

  async function run(label: string, call: () => Promise<{ __kind__: "ok" } | { __kind__: "err"; err: { __kind__: string } }>) {
    try {
      const res = await call();
      if (res.__kind__ === "err") throw new Error(res.err.__kind__);
      setNotice(label);
      const fresh = await load();
      if (selected && fresh) setSelected(fresh.items.find((m) => m.id === selected.id) ?? null);
    } catch (e) {
      setError(`Åtgärden misslyckades: ${errText(e)}`);
    }
  }

  async function open(m: Message) {
    setSelected(m);
    setNotice("");
    if (m.status === Status.new) {
      await run("Markerad som läst", () => actor.setStatus(m.id, Status.read));
    }
  }

  async function exportCsv() {
    try {
      const res = await actor.exportMessagesCsv();
      if (res.__kind__ === "err") throw new Error(res.err.__kind__);
      const url = URL.createObjectURL(new Blob(["﻿" + res.ok], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `axelkod-meddelanden-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`Exporten misslyckades: ${errText(e)}`);
    }
  }

  const total = page ? Number(page.total) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl uppercase">Inkorg</h1>
        <button type="button" className="btn btn-secondary" onClick={() => void exportCsv()}>Exportera CSV</button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filtrera på status" className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key}
              className="rounded-md border border-[var(--input-border)] px-3 py-1.5 text-sm font-medium aria-pressed:bg-[var(--color-navy-900)] aria-pressed:text-white"
              onClick={() => { setFilter(f.key); setOffset(0); }}>
              {f.label}{f.key === Status.new && page ? ` (${page.unread})` : ""}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium">Sök</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Namn, e-post, företag, text"
            className="w-64 rounded-md border border-[var(--input-border)] bg-bg px-3 py-1.5" />
        </label>
      </div>

      <p role="status" aria-live="polite" className="mt-3 min-h-6 text-sm">
        {error ? <span className="text-[var(--error)]">{error}</span> : notice}
      </p>

      <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section aria-label="Meddelanden">
          {page && page.items.length === 0 && <p className="card text-muted">Inga meddelanden.</p>}
          <ul className="space-y-2">
            {page?.items.map((m) => (
              <li key={m.id.toString()}>
                <button type="button" onClick={() => void open(m)} aria-current={selected?.id === m.id ? "true" : undefined}
                  className="w-full rounded-lg border border-border bg-bg p-4 text-left aria-[current=true]:border-accent">
                  <span className="flex items-center justify-between gap-3">
                    <span className={`truncate ${m.status === Status.new ? "font-bold" : "font-medium"}`}>{m.name}</span>
                    <span className="shrink-0 text-xs text-muted">{date(m.createdAt)}</span>
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-3 text-sm text-muted">
                    <span className="truncate">{areaLabel[m.area]} · {m.email}</span>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs">{statusLabel[m.status]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {total > PAGE && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <button type="button" className="btn btn-secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Föregående</button>
              <span>{offset + 1}–{Math.min(offset + PAGE, total)} av {total}</span>
              <button type="button" className="btn btn-secondary" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Nästa</button>
            </div>
          )}
        </section>

        {selected ? (
          <MessageDetail key={selected.id.toString()} m={selected} run={run} onDeleted={() => setSelected(null)} />
        ) : (
          <p className="card hidden text-muted lg:block">Välj ett meddelande.</p>
        )}
      </div>
    </div>
  );
}

function MessageDetail({ m, run, onDeleted }: {
  m: Message;
  run: (label: string, call: () => Promise<{ __kind__: "ok" } | { __kind__: "err"; err: { __kind__: string } }>) => Promise<void>;
  onDeleted: () => void;
}) {
  const { actor } = useAdmin();
  const [note, setNote] = useState(m.adminNote ?? "");
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1"><dt className="text-muted">{label}</dt><dd className="break-words">{value}</dd></div>
  );
  return (
    <article className="card" aria-labelledby="msg-title">
      <h2 id="msg-title" className="text-2xl">{m.name}</h2>
      <dl className="mt-3 text-sm">
        {row("Mottaget", date(m.createdAt))}
        {row("E-post", <a href={`mailto:${m.email}`}>{m.email}</a>)}
        {m.phone && row("Telefon", <a href={`tel:${m.phone.replace(/[^\d+]/g, "")}`}>{m.phone}</a>)}
        {m.company && row("Företag", m.company)}
        {row("Område", areaLabel[m.area])}
        {row("Språk", m.lang)}
        {row("Status", statusLabel[m.status])}
      </dl>
      <h3 className="mt-5 text-lg">Meddelande</h3>
      <p className="mt-1 whitespace-pre-wrap rounded-md bg-bg p-3">{m.message}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {[Status.new, Status.read, Status.handled].filter((s) => s !== m.status).map((s) => (
          <button key={s} type="button" className="btn btn-secondary" onClick={() => void run(`Markerad som ${statusLabel[s].toLowerCase()}`, () => actor.setStatus(m.id, s))}>
            Markera som {statusLabel[s].toLowerCase()}
          </button>
        ))}
      </div>

      <label htmlFor="note" className="mt-5 block font-medium">Intern anteckning</label>
      <textarea id="note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
        className="mt-1 w-full rounded-md border border-[var(--input-border)] bg-bg px-3 py-2" />
      <div className="mt-3 flex flex-wrap justify-between gap-2">
        <button type="button" className="btn btn-primary" onClick={() => void run("Anteckningen sparad", () => actor.setNote(m.id, note))}>Spara anteckning</button>
        <button type="button" className="btn btn-secondary text-[var(--error)]"
          onClick={() => {
            if (confirm(`Radera meddelandet från ${m.name}? Det går inte att ångra.`)) {
              void run("Meddelandet raderat", () => actor.deleteMessage(m.id)).then(onDeleted);
            }
          }}>
          Radera
        </button>
      </div>
    </article>
  );
}

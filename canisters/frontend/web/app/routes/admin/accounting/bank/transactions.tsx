// Bank › Transaktioner: the matching workbench. Unmatched transactions on the left,
// suggestions for the selected one on the right (OCR, then amount and date, then
// rules). The top suggestion has focus, so Enter accepts it and moves on.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { BankAccount, BankTx, Suggestion } from "../../../../bindings/accounting";
import { AccountingError, ok } from "../../../../admin/accounting/api";
import { useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { AccountPicker } from "../../../../admin/accounting/ui/AccountPicker";
import { SectionTabs, bankTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { DocRef, EmptyState, Money, MoneyInput, PageHead, StatusChip, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

export default function Transactions() {
  const t = useAccT();
  const b = t.bank;
  const err = useErr();
  const { acc, canBook, href } = useAcc();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState<bigint | null>(null);
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<BankTx[] | null>(null);
  const [sel, setSel] = useState<bigint | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useCrumbs([{ label: b.title }]);
  const report = useCallback((e: unknown) => setStatus({ ok: false, text: err(e) }), [err]);

  useEffect(() => {
    acc.listBankAccounts().then((r) => { const xs = ok(r); setAccounts(xs); setAccountId((c) => c ?? xs[0]?.id ?? null); }).catch((e) => setStatus({ ok: false, text: err(e) }));
  }, [acc, err]);

  const load = useCallback(async (keep?: bigint | null) => {
    if (accountId === null) { setRows([]); return; }
    const items = ok(await acc.listBankTxs(accountId, !all, 0n, 500n)).items;
    setRows(items);
    const open = items.filter((x) => !x.match);
    setSel((c) => (keep !== undefined ? keep : c !== null && items.some((x) => x.id === c) ? c : open[0]?.id ?? null));
  }, [acc, accountId, all]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);

  async function matched(id: bigint) {
    setStatus({ ok: true, text: b.match.done });
    const items = ok(await acc.listBankTxs(accountId!, !all, 0n, 500n)).items;
    setRows(items);
    const open = items.filter((x) => !x.match);
    const i = open.findIndex((x) => x.id > id);
    setSel((open[i] ?? open[0])?.id ?? null);
  }

  const current = rows?.find((x) => x.id === sel) ?? null;
  const unmatched = rows?.filter((x) => !x.match).length ?? 0;

  return (
    <>
      <PageHead title={b.title} actions={<Link to={href("/admin/accounting/bank/import")} className="btn btn-secondary">{b.tabs.import}</Link>}>
        <SectionTabs {...bankTabs(b)} />
      </PageHead>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        {accounts.length > 1 && <div><label htmlFor="bk-acc" className={label}>{b.account}</label>
          <select id="bk-acc" className={input} value={accountId === null ? "" : String(accountId)} onChange={(e) => setAccountId(BigInt(e.target.value))}>
            {accounts.map((a) => <option key={String(a.id)} value={String(a.id)}>{a.name} ({String(a.ledgerAccount)})</option>)}
          </select></div>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {b.showAll}</label>
        {rows && <StatusChip tone={unmatched ? "warn" : "good"}>{b.unmatched(unmatched)}</StatusChip>}
      </div>
      {!rows ? <p role="status">{t.common.loading}</p> : rows.length === 0 ? <EmptyState text={b.empty} action={<Link to={href("/admin/accounting/bank/import")} className="btn btn-primary">{b.tabs.import}</Link>} /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ul aria-label={b.tabs.transactions} className="card max-h-[70vh] divide-y divide-border overflow-y-auto p-0">
            {rows.map((x) => (
              <li key={String(x.id)}>
                <button type="button" aria-pressed={x.id === sel} onClick={() => setSel(x.id)}
                  className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-surface-strong ${x.id === sel ? "bg-[var(--brand-soft)]" : ""}`}>
                  <span><span className="block text-sm text-muted">{x.date}</span><span className="block">{x.text}</span>{x.reference && <span className="block text-xs text-muted">{x.reference}</span>}</span>
                  <span className="text-right"><span className={x.amount < 0n ? "" : "text-accent"}><Money ore={x.amount} /></span>
                    {x.match && <span className="mt-1 block"><StatusChip tone="good">{b.match.kinds[x.match.kind.__kind__]}</StatusChip></span>}</span>
                </button>
              </li>
            ))}
          </ul>
          {current ? <MatchPanel key={String(current.id)} tx={current} canBook={canBook} onMatched={() => void matched(current.id)} onError={report} />
            : <EmptyState text={b.allMatched} />}
        </div>
      )}
      <Toast status={status} />
    </>
  );
}

function MatchPanel({ tx, canBook, onMatched, onError }: { tx: BankTx; canBook: boolean; onMatched: () => void; onError: (e: unknown) => void }) {
  const t = useAccT();
  const m = t.bank.match;
  const { acc, accountName } = useAcc();
  const [sugg, setSugg] = useState<Suggestion[] | null>(null);
  const [foreign, setForeign] = useState<{ s: Suggestion; amount: bigint | null } | null>(null);
  const [counter, setCounter] = useState<bigint | null>(null);
  const [text, setText] = useState(tx.text);
  const [rule, setRule] = useState(false);
  const [ruleText, setRuleText] = useState(tx.counterparty ?? tx.text.split(/\s+/)[0] ?? "");
  const [voucherId, setVoucherId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tx.match) { setSugg([]); return; }
    acc.suggestBankMatches(tx.id).then((r) => setSugg(ok(r))).catch(onError);
  }, [acc, tx, onError]);

  async function run(f: () => Promise<unknown>) {
    setBusy(true);
    try { await f(); onMatched(); } catch (e) { onError(e); } finally { setBusy(false); }
  }

  async function accept(s: Suggestion, amount: bigint | null = null) {
    setBusy(true);
    try {
      const target = s.target;
      if (target.__kind__ === "invoice") ok(await acc.matchBankToInvoice(tx.id, target.invoice, amount));
      else if (target.__kind__ === "purchase") ok(await acc.matchBankToPurchase(tx.id, target.purchase, amount));
      else ok(await acc.bookBankTx(tx.id, target.rule, [], ""));
      onMatched();
    } catch (e) {
      // A foreign-currency document needs the amount in its own currency.
      if (e instanceof AccountingError && e.err.__kind__ === "invalid" && e.err.invalid === "amount" && s.target.__kind__ !== "rule" && amount === null) setForeign({ s, amount: null });
      else onError(e);
    } finally { setBusy(false); }
  }

  if (tx.match) {
    return (
      <section className="card space-y-2" aria-labelledby="mp-h">
        <h2 id="mp-h" className="text-xl">{tx.text}</h2>
        <p><Money ore={tx.amount} unit /> · {tx.date}</p>
        <p><StatusChip tone="good">{m.kinds[tx.match.kind.__kind__]}</StatusChip> <DocRef id={tx.match.voucherId} label={`#${tx.match.voucherId}`} /></p>
      </section>
    );
  }

  return (
    <section className="card space-y-5" aria-labelledby="mp-h">
      <div>
        <h2 id="mp-h" className="text-xl">{m.title}</h2>
        <p className="mt-1">{tx.text} · {tx.date} · <strong><Money ore={tx.amount} unit /></strong></p>
        {tx.reference && <p className="text-sm text-muted">{t.bank.reference}: {tx.reference}</p>}
      </div>
      <div>
        <h3 className="mb-2 font-semibold">{m.suggestions}</h3>
        {!sugg ? <p role="status">{t.common.loading}</p> : sugg.length === 0 ? <p className="text-muted">{m.none}</p> : (
          <ul className="space-y-2">
            {sugg.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <span><StatusChip tone="info">{m.reason[s.reason]}</StatusChip> <span className="ml-1">{s.title}</span> <Money ore={s.amount} /></span>
                {canBook && <button type="button" className="btn btn-primary px-3 py-1" disabled={busy} autoFocus={i === 0} aria-describedby={i === 0 ? "mp-enter" : undefined} onClick={() => void accept(s)}>{m.accept}</button>}
              </li>
            ))}
          </ul>
        )}
        {sugg && sugg.length > 0 && <p id="mp-enter" className="mt-1 text-xs text-muted">{m.acceptHint}</p>}
        {foreign && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div><span className={label}>{m.foreignAmount}</span><MoneyInput labelText={m.foreignAmount} value={foreign.amount} onChange={(v) => setForeign({ ...foreign, amount: v })} /></div>
            <button type="button" className="btn btn-primary" disabled={busy || foreign.amount === null} onClick={() => void accept(foreign.s, foreign.amount)}>{m.accept}</button>
          </div>
        )}
      </div>
      {canBook && (
        <form className="space-y-3 border-t border-border pt-4" onSubmit={(e) => {
          e.preventDefault();
          if (counter === null) return;
          void run(async () => {
            ok(await acc.bookBankTx(tx.id, null, [{ account: counter, amount: -tx.amount }], text));
            if (rule && ruleText.trim()) ok(await acc.saveBankRule(null, { contains: ruleText.trim(), account: counter, vatRateBp: 0n, description: text.trim() || ruleText.trim() }));
          });
        }}>
          <h3 className="font-semibold">{m.manual}</h3>
          <AccountPicker labelText={m.counterAccount} value={counter} onChange={(a) => setCounter(a?.number ?? null)} />
          {counter !== null && <p className="text-sm text-muted">{String(counter)} {accountName(counter)}</p>}
          <div><label htmlFor="mp-text" className={label}>{m.description}</label><input id="mp-text" className={input} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} /></div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={rule} onChange={(e) => setRule(e.target.checked)} /> {m.makeRule}</label>
          {rule && <div><label htmlFor="mp-rule" className={label}>{m.ruleText}</label><input id="mp-rule" className={input} maxLength={100} value={ruleText} onChange={(e) => setRuleText(e.target.value)} /></div>}
          <button type="submit" className="btn btn-secondary" disabled={busy || counter === null}>{m.bookManual}</button>
        </form>
      )}
      {canBook && (
        <form className="flex flex-wrap items-end gap-3 border-t border-border pt-4" onSubmit={(e) => { e.preventDefault(); if (/^\d+$/.test(voucherId)) void run(async () => ok(await acc.linkBankTx(tx.id, BigInt(voucherId)))); }}>
          <h3 className="w-full font-semibold">{m.link}</h3>
          <div><label htmlFor="mp-v" className={label}>{m.voucherId}</label><input id="mp-v" inputMode="numeric" className={input} value={voucherId} onChange={(e) => setVoucherId(e.target.value)} /></div>
          <button type="submit" className="btn btn-secondary" disabled={busy || !/^\d+$/.test(voucherId)}>{m.linkButton}</button>
        </form>
      )}
    </section>
  );
}

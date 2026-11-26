// ROT/RUT › Begäran: Underlag → Köpare & fastighet → Skapa fil → Markera inskickad →
// Importera beslut. The XML and the decision matching need the decrypted personnummer,
// so both run here (V12); the canister books the decision (bank against 1513).
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { CaseStatus, type Claim, type HusCase, type HusPart } from "../../../../bindings/accounting";
import { ok } from "../../../../admin/accounting/api";
import { today, useAcc, useAccT, useErr } from "../../../../admin/accounting/context";
import { useCrumbs } from "../../../../admin/accounting/crumbs";
import { saveFile } from "../../../../admin/accounting/pdf/client";
import { claimXml, decryptIdentity, decryptProperty, matchDecision, parseDecision, type ClaimCase, type DecisionMatch } from "../../../../admin/accounting/rotrut";
import { SectionTabs, rotRutTabs } from "../../../../admin/accounting/ui/SectionTabs";
import { Stepper, type Step } from "../../../../admin/accounting/ui/Stepper";
import { DocRef, Money, MoneyInput, PageHead, input, label } from "../../../../admin/accounting/ui/kit";
import { Toast } from "../../../../admin/toast";

type Loaded = { claim: Claim; cases: HusCase[]; hus: Map<bigint, HusPart> };

export default function HusClaim() {
  const t = useAccT();
  const r = t.rotRut;
  const x = r.claims;
  const err = useErr();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const { acc, canBook, data, href } = useAcc();
  const [d, setD] = useState<Loaded | null>(null);
  const [plain, setPlain] = useState<ClaimCase[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [sub, setSub] = useState({ date: today(), confirmed: false });
  const [dec, setDec] = useState<{ matches: DecisionMatch[]; unmatched: number } | null>(null);
  const [decDate, setDecDate] = useState(today());
  const [bank, setBank] = useState("1930");
  const [manual, setManual] = useState<Record<string, { approved: bigint | null; reference: string }>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>((location.state as { message?: string } | null)?.message ? { ok: true, text: (location.state as { message: string }).message } : null);
  useCrumbs([{ label: r.title, to: "/admin/accounting/rot-rut" }, { label: r.tabs.claims, to: "/admin/accounting/rot-rut/claims" }, { label: d?.claim.name ?? "…" }]);

  const load = useCallback(async () => {
    const [cl, cs] = await Promise.all([acc.listHusClaims(), acc.listHusCases()]);
    const claim = ok(cl).find((c) => String(c.id) === id);
    if (!claim) throw new Error(t.errors.notFound);
    const cases = ok(cs).filter((c) => claim.caseIds.includes(c.id));
    const docs = await Promise.all(cases.map(async (c) => [c.id, ok(await acc.getSalesDoc(c.salesDocId)).doc.snapshot.hus] as const));
    setD({ claim, cases, hus: new Map(docs.filter((e): e is readonly [bigint, HusPart] => !!e[1])) });
  }, [acc, id, t]);
  useEffect(() => { void load().catch((e) => setStatus({ ok: false, text: err(e) })); }, [load, err]);

  async function decrypt(): Promise<ClaimCase[] | null> {
    if (plain) return plain;
    if (!d) return null;
    try {
      const out = await Promise.all(d.cases.map(async (c) => {
        const h = d.hus.get(c.id)!;
        const buyers = await Promise.all(h.buyers.map((b) => decryptIdentity(acc, b.identityEnc)));
        const property = h.propertyEnc ? await decryptProperty(acc, h.propertyEnc) : undefined;
        return { c, hus: h, buyers, property };
      }));
      setPlain(out);
      // A dry run of the file shows any problem (personnummer, age, amounts) before it is needed.
      try { if (data?.company) claimXml(data.company, d.claim, out); setProblem(null); } catch (e) { setProblem((e as Error).message); }
      return out;
    } catch (e) { setStatus({ ok: false, text: err(e) }); return null; }
  }

  async function download() {
    const p = await decrypt();
    if (!p || !d || !data?.company) return;
    try {
      saveFile(new Blob([claimXml(data.company, d.claim, p)], { type: "application/xml" }), `begaran-${d.claim.kind}-${d.claim.name.replace(/[^\w-]+/g, "_")}.xml`);
    } catch (e) { setStatus({ ok: false, text: (e as Error).message }); }
  }

  async function act(f: () => Promise<unknown>, text: string) {
    setBusy(true);
    try { await f(); setStatus({ ok: true, text }); setStep(null); await load(); } catch (e) { setStatus({ ok: false, text: err(e) }); } finally { setBusy(false); }
  }

  async function readDecision(file: File) {
    const p = await decrypt();
    if (!p || !d) return;
    try {
      const parsed = parseDecision(await file.text());
      const open = p.filter((q) => q.c.status === CaseStatus.submitted).map((q) => ({ c: q.c, claimName: d.claim.name, pnrs: q.buyers.map((b) => b.personnummer) }));
      setDec(matchDecision(parsed, open));
    } catch (e) { setStatus({ ok: false, text: (e as Error).message }); }
  }

  async function applyAll(list: DecisionMatch[]) {
    await act(async () => {
      for (const m of list) ok(await acc.applyHusDecision({ caseId: m.caseId, approved: m.approved, reference: m.reference, date: decDate, bankAccount: BigInt(bank) }));
    }, x.applied);
    setDec(null);
  }

  if (!d) return <><p role="status">{t.common.loading}</p><Toast status={status} /></>;
  const { claim, cases } = d;
  const submitted = !!claim.submittedDate;
  const decided = cases.every((c) => c.status === CaseStatus.decided);
  const steps: Step[] = [
    { key: "basis", title: x.steps[0], state: "done" },
    { key: "buyers", title: x.steps[1], state: plain && !problem ? "done" : submitted ? "done" : "current" },
    { key: "file", title: x.steps[2], state: submitted ? "done" : plain && !problem ? "current" : "todo" },
    { key: "submit", title: x.steps[3], state: submitted ? "done" : "todo" },
    { key: "decision", title: x.steps[4], state: decided ? "done" : submitted ? "current" : "later" },
  ];
  const active = step ?? steps.find((s) => s.state === "current")?.key ?? "basis";
  const banks = (data?.accounts ?? []).filter((a) => a.active && a.number >= 1900n && a.number < 2000n);
  const tooHigh = dec?.matches.some((m) => m.approved > (cases.find((c) => c.id === m.caseId)?.requested ?? 0n));

  return (
    <>
      <PageHead title={`${r.kind[claim.kind]} · ${claim.name}`}><SectionTabs {...rotRutTabs(r)} /></PageHead>
      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <div className="card self-start"><Stepper steps={steps} onSelect={setStep} />
          <p className="mt-3 text-sm text-muted">{r.cases.year} {String(claim.year)} · XML {claim.xmlVersion}</p></div>
        <div className="space-y-4">
          {active === "basis" && (
            <section className="card overflow-x-auto" aria-labelledby="cl-basis">
              <h2 id="cl-basis" className="text-2xl">{x.steps[0]}</h2>
              <p className="text-sm text-muted">{x.review}</p>
              <table className="mt-3 w-full text-sm">
                <caption className="sr-only">{x.cases}</caption>
                <thead><tr className="border-b border-border text-left text-muted">
                  <th scope="col" className="py-2">{r.cases.invoice}</th><th scope="col" className="py-2">{t.common.date}</th>
                  <th scope="col" className="py-2 text-right">{r.editor.labour}</th><th scope="col" className="py-2 text-right">{r.cases.requested}</th>
                  <th scope="col" className="py-2">{t.payroll.runs.status}</th>
                </tr></thead>
                <tbody>{cases.map((c) => (
                  <tr key={String(c.id)} className="border-b border-border">
                    <td className="py-2"><Link to={href(`/admin/accounting/sales/docs/${c.salesDocId}`)}>{String(c.invoiceNumber)}</Link>
                      <span className="block text-xs text-muted">{c.hours.map((h) => `${r.work[h.workType] ?? h.workType} ${h.hours} h`).join(", ")}</span></td>
                    <td className="py-2">{c.paymentDate}</td>
                    <td className="py-2 text-right"><Money ore={c.labour} /></td>
                    <td className="py-2 text-right"><Money ore={c.requested} /></td>
                    <td className="py-2">{r.cases.status[c.status]}{c.approved !== undefined && <> · <Money ore={c.approved} /></>}</td>
                  </tr>
                ))}</tbody>
              </table>
              {canBook && !submitted && <button type="button" className="mt-4 text-sm text-muted hover:text-[var(--error)]"
                onClick={() => void act(async () => { ok(await acc.deleteHusClaim(claim.id)); navigate(href("/admin/accounting/rot-rut/claims")); }, x.removed)}>{x.remove}</button>}
            </section>
          )}
          {active === "buyers" && (
            <section className="card" aria-labelledby="cl-buyers">
              <h2 id="cl-buyers" className="text-2xl">{x.steps[1]}</h2>
              {!plain ? <button type="button" className="btn btn-secondary mt-3" onClick={() => void decrypt()}>{x.decrypt}</button> : (
                <>
                  <ul className="mt-3 space-y-3 text-sm">{plain.map((q) => (
                    <li key={String(q.c.id)}>
                      <p className="font-semibold">{r.cases.invoice} {String(q.c.invoiceNumber)}</p>
                      <ul>{q.buyers.map((b, i) => <li key={i}>{b.name}, {b.personnummer} – <Money ore={q.c.buyerAmounts[i] ?? 0n} /> kr</li>)}</ul>
                      {q.property && <p className="text-muted">{"fastighetsbeteckning" in q.property ? q.property.fastighetsbeteckning : `BRF ${q.property.brfOrgNr}, lgh ${q.property.lagenhetsnummer}`}</p>}
                    </li>
                  ))}</ul>
                  {problem ? <p role="alert" className="mt-3 text-[var(--error)]">{problem}</p> : <p className="mt-3 text-sm">{x.buyersOk}</p>}
                </>
              )}
            </section>
          )}
          {active === "file" && (
            <section className="card" aria-labelledby="cl-file">
              <h2 id="cl-file" className="text-2xl">{x.steps[2]}</h2>
              <p className="text-sm text-muted">{x.fileIntro}</p>
              <button type="button" className="btn btn-primary mt-3" onClick={() => void download()}>{x.download}</button>
            </section>
          )}
          {active === "submit" && (
            <section className="card space-y-3" aria-labelledby="cl-submit">
              <h2 id="cl-submit" className="text-2xl">{x.steps[3]}</h2>
              {submitted ? <p>{x.submitted} {claim.submittedDate}</p> : canBook && <>
                <div className="max-w-xs"><label htmlFor="cl-date" className={label}>{x.submitDate}</label>
                  <input id="cl-date" type="date" className={input} value={sub.date} onChange={(e) => setSub({ ...sub, date: e.target.value })} /></div>
                <label className="flex items-center gap-2"><input type="checkbox" checked={sub.confirmed} onChange={(e) => setSub({ ...sub, confirmed: e.target.checked })} /> {x.confirm}</label>
                <button type="button" className="btn btn-primary" disabled={busy || (claim.xmlVersion === "1.1" && !sub.confirmed)}
                  onClick={() => void act(async () => ok(await acc.markHusClaimSubmitted(claim.id, sub.date, sub.confirmed)), x.submittedDone)}>{x.markSubmitted}</button>
              </>}
            </section>
          )}
          {active === "decision" && (
            <section className="card space-y-4" aria-labelledby="cl-dec">
              <h2 id="cl-dec" className="text-2xl">{x.steps[4]}</h2>
              <p className="text-sm text-muted">{x.decisionIntro}</p>
              {canBook && submitted && !decided && <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label htmlFor="cl-ddate" className={label}>{x.decisionDate}</label>
                    <input id="cl-ddate" type="date" className={input} value={decDate} onChange={(e) => setDecDate(e.target.value)} /></div>
                  <div><label htmlFor="cl-bank" className={label}>{x.bankAccount}</label>
                    <select id="cl-bank" className={input} value={bank} onChange={(e) => setBank(e.target.value)}>
                      {banks.map((a) => <option key={String(a.number)} value={String(a.number)}>{String(a.number)} {a.name}</option>)}
                    </select></div>
                </div>
                <div><label htmlFor="cl-json" className={label}>{x.decisionFile}</label>
                  <input id="cl-json" type="file" accept="application/json,.json" className={input} onChange={(e) => { const f = e.target.files?.[0]; if (f) void readDecision(f); }} /></div>
                {dec && <div className="space-y-2 text-sm" aria-live="polite">
                  <p>{x.matched(dec.matches.length)}{dec.unmatched ? ` · ${x.unmatched(dec.unmatched)}` : ""}</p>
                  <ul>{dec.matches.map((m) => {
                    const c = cases.find((y) => y.id === m.caseId);
                    return <li key={String(m.caseId)}>{r.cases.invoice} {String(c?.invoiceNumber)}: <Money ore={m.approved} /> / <Money ore={c?.requested ?? 0n} /> kr · {m.reference}</li>;
                  })}</ul>
                  {tooHigh ? <p role="alert" className="text-[var(--error)]">{x.tooHigh}</p>
                    : <button type="button" className="btn btn-primary" disabled={busy || !dec.matches.length} onClick={() => void applyAll(dec.matches)}>{x.apply}</button>}
                </div>}
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">{x.manual}</summary>
                  <ul className="mt-3 space-y-3">{cases.filter((c) => c.status === CaseStatus.submitted).map((c) => {
                    const m = manual[String(c.id)] ?? { approved: c.requested, reference: "" };
                    const set = (p: Partial<typeof m>) => setManual({ ...manual, [String(c.id)]: { ...m, ...p } });
                    return (
                      <li key={String(c.id)} className="grid gap-2 sm:grid-cols-[8rem_10rem_minmax(0,1fr)_auto] sm:items-end">
                        <span className="text-sm">{r.cases.invoice} {String(c.invoiceNumber)}</span>
                        <MoneyInput labelText={`${x.approved}, ${r.cases.invoice} ${c.invoiceNumber}`} value={m.approved} onChange={(v) => set({ approved: v })} />
                        <input aria-label={`${x.reference}, ${r.cases.invoice} ${c.invoiceNumber}`} className="rounded-md border border-[var(--input-border)] bg-bg px-2 py-1.5"
                          value={m.reference} placeholder="20260000185-01" onChange={(e) => set({ reference: e.target.value })} />
                        <button type="button" className="btn btn-secondary" disabled={busy || m.approved === null || !m.reference}
                          onClick={() => void applyAll([{ caseId: c.id, approved: m.approved ?? 0n, reference: m.reference.trim() }])}>{x.apply}</button>
                      </li>
                    );
                  })}</ul>
                </details>
              </>}
              {cases.filter((c) => c.voucherId !== undefined).map((c) => <p key={String(c.id)} className="text-sm">{r.cases.invoice} {String(c.invoiceNumber)}: {c.decisionRef} · <DocRef id={c.voucherId!} label={`#${c.voucherId}`} search={href("")} /></p>)}
            </section>
          )}
        </div>
      </div>
      <Toast status={status} />
    </>
  );
}

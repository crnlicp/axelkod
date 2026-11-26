// Inställningar › Säkerhetskopia (A9c, owner only): take an encrypted backup, and check,
// unpack or restore one. A restore is allowed only into an empty installation.
import { useState } from "react";
import { createBackup, readBackup, restoreBackup, seal, strength, passOk, unseal, type Manifest } from "../backup";
import { useAcc, useAccT, useErr } from "../context";
import { saveFile } from "../pdf/client";

type Checked = { manifest: Manifest; zip: Uint8Array; empty: boolean };

export function BackupPanel() {
  const t = useAccT();
  const b = t.backup;
  const err = useErr();
  const { acc, vault, data, isOwner, reload } = useAcc();
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rpass, setRpass] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);

  if (!isOwner) return <p role="note" className="card">{b.ownerOnly}</p>;
  const s = strength(pass);
  const progress = (k: string, done: number, total: number) => setStep(`${b.steps[k as keyof typeof b.steps] ?? k} ${total ? `${done + 1}/${total}` : ""}`);

  async function create() {
    setMsg([]);
    try {
      const out = await createBackup(acc, vault, progress);
      setStep(b.steps.encrypt);
      const sealed = await seal(out.zip, pass);
      const org = (data?.company?.orgNr ?? "").replace("-", "");
      const name = `axelkod-ekonomi-${org}-${out.manifest.createdAt.slice(0, 10)}.axbak`;
      saveFile(new Blob([sealed as Uint8Array<ArrayBuffer>], { type: "application/octet-stream" }), name);
      setMsg([
        { ok: true, text: b.done(name) },
        ...(out.manifest.unreadable.length ? [{ ok: false, text: b.unreadable(out.manifest.unreadable.length) }] : []),
        ...(out.manifest.unreadablePii ? [{ ok: false, text: b.unreadablePii(out.manifest.unreadablePii) }] : []),
      ]);
      setPass(""); setPass2("");
    } catch (e) { setMsg([{ ok: false, text: err(e) }]); } finally { setStep(null); }
  }

  async function check() {
    if (!file) return;
    setMsg([]); setChecked(null);
    try {
      const zip = await unseal(new Uint8Array(await file.arrayBuffer()), rpass).catch((e: Error) => {
        throw new Error(e.message === "passphrase" ? b.wrongPass : b.badFile);
      });
      const { manifest } = await readBackup(zip).catch(() => { throw new Error(b.badFile); });
      const st = await acc.restoreState();
      const empty = st.__kind__ === "ok" && (st.ok.empty || st.ok.restoring);
      setChecked({ manifest, zip, empty });
      setMsg([{ ok: true, text: b.checked(manifest.createdAt.slice(0, 10), manifest.company?.legalName ?? "") }]);
    } catch (e) { setMsg([{ ok: false, text: e instanceof Error && (e.message === b.wrongPass || e.message === b.badFile) ? e.message : err(e) }]); }
  }

  async function restore() {
    if (!checked || !window.confirm(b.restoreConfirm)) return;
    setMsg([]);
    try {
      const { skipped } = await restoreBackup(acc, vault, checked.zip, progress);
      setMsg([{ ok: true, text: b.restored }, ...(skipped.length ? [{ ok: false, text: b.skipped(skipped.length) }] : [])]);
      setChecked(null);
      await reload();
    } catch (e) { setMsg([{ ok: false, text: err(e) }]); } finally { setStep(null); }
  }

  const busy = step !== null;
  return (
    <div className="space-y-6">
      {msg.map((m) => <p key={m.text} role={m.ok ? "status" : "alert"} className={m.ok ? "text-accent" : "text-[var(--error)]"}>{m.text}</p>)}
      {step && <p role="status" aria-live="polite" className="text-muted">{step}…</p>}
      <form className="card max-w-2xl space-y-3" aria-labelledby="bk-create" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <h2 id="bk-create" className="text-2xl">{b.create}</h2>
        <p className="text-sm text-muted">{b.lead}</p>
        <label className="block">{b.passphrase}
          <input type="password" className="input mt-1 block w-full" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} aria-describedby="bk-hint bk-meter" />
        </label>
        <p id="bk-hint" className="text-sm text-muted">{b.hint}</p>
        <div id="bk-meter" className="flex items-center gap-3 text-sm">
          <span>{b.strengthLabel}:</span>
          <meter min={0} max={4} low={2} high={3} optimum={4} value={pass ? s.score : 0} aria-label={b.strengthLabel} className="w-40" />
          <span>{pass ? b.strength[s.score] : ""}</span>
        </div>
        <label className="block">{b.confirm}
          <input type="password" className="input mt-1 block w-full" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} aria-invalid={!!pass2 && pass2 !== pass} />
        </label>
        {pass2 && pass2 !== pass && <p className="text-sm text-[var(--error)]">{b.mismatch}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !passOk(pass) || pass !== pass2}>{b.create}</button>
      </form>

      <section className="card max-w-2xl space-y-3" aria-labelledby="bk-restore">
        <h2 id="bk-restore" className="text-2xl">{b.restoreTitle}</h2>
        <p className="text-sm text-muted">{b.restoreLead}</p>
        <label className="block">{b.file}
          <input type="file" accept=".axbak" className="mt-1 block" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setChecked(null); }} />
        </label>
        <label className="block">{b.passphrase}
          <input type="password" className="input mt-1 block w-full" autoComplete="off" value={rpass} onChange={(e) => setRpass(e.target.value)} />
        </label>
        <button type="button" className="btn btn-secondary" disabled={busy || !file || !rpass} onClick={() => void check()}>{b.check}</button>
        {checked && (
          <>
            <table className="w-full text-sm">
              <caption className="text-left font-medium">{b.contents}</caption>
              <tbody>
                {checked.manifest.stores.filter((x) => x.count > 0).map((x) => (
                  <tr key={x.store} className="border-t border-border"><th scope="row" className="py-1 text-left font-normal">{x.store}</th><td className="py-1 text-right">{x.count} {b.records}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => saveFile(new Blob([checked.zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }), `${file?.name.replace(/\.axbak$/, "") ?? "backup"}.zip`)}>{b.unzip}</button>
              <button type="button" className="btn btn-primary" disabled={busy || !checked.empty} onClick={() => void restore()}>{b.restore}</button>
            </div>
            <p className="text-sm text-muted">{b.unzipWarn}</p>
            {!checked.empty && <p role="note" className="text-sm">{b.notEmpty}</p>}
          </>
        )}
      </section>
    </div>
  );
}

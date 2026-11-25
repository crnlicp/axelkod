// Confirmation for irreversible actions: what is created, the lines, the date and
// its period, warnings, and a button that names the action.
import type { ReactNode } from "react";
import { useAcc, useAccT, today } from "../context";
import { addDays } from "../deadlines";
import { Dialog } from "./Dialog";
import { Money } from "./kit";

export type ConfirmLine = { account: bigint; amount: bigint; text?: string };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function ConfirmPost({ open, onClose, onConfirm, title, creates, date, lines, button, busy, extra }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; creates: string; date: string;
  lines: ConfirmLine[]; button: string; busy: boolean; extra?: ReactNode;
}) {
  const t = useAccT();
  const { accountName, data } = useAcc();
  const late = daysBetween(date, today());
  const lock = data?.lockDate;
  const nearLock = lock ? date <= addDays(lock, 7) : false;
  return (
    <Dialog open={open} onClose={onClose} title={title} wide
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t.common.cancel}</button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>{busy ? t.editor.posting : button}</button>
      </>}>
      <p>{creates}</p>
      <p className="mt-2 text-sm text-muted">{t.editor.date}: <strong className="text-fg">{date}</strong></p>
      <table className="mt-4 w-full text-sm">
        <thead><tr className="text-left text-muted">
          <th scope="col" className="py-1">{t.common.account}</th><th scope="col" className="py-1 text-right">{t.common.debit}</th><th scope="col" className="py-1 text-right">{t.common.credit}</th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1">{String(l.account)} {accountName(l.account)}{l.text ? ` – ${l.text}` : ""}</td>
              <td className="py-1 text-right">{l.amount > 0n ? <Money ore={l.amount} /> : null}</td>
              <td className="py-1 text-right">{l.amount < 0n ? <Money ore={-l.amount} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {late > 3 && <p role="note" className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">{t.confirm.lateDate(late)}</p>}
      {nearLock && <p role="note" className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">{t.confirm.nearLock}</p>}
      {extra}
      <p className="mt-4 font-semibold">{t.confirm.irreversible}</p>
    </Dialog>
  );
}

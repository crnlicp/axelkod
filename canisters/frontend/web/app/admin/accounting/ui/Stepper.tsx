// Guided flow: numbered steps, each done / current / to do / later.
import { IconCheck } from "../../../components/Icons";
import { useAccT } from "../context";

export type Step = { key: string; title: string; state: "done" | "current" | "todo" | "later" };

export function Stepper({ steps, onSelect }: { steps: Step[]; onSelect: (key: string) => void }) {
  const t = useAccT().setup;
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => (
        <li key={s.key}>
          <button type="button" onClick={() => onSelect(s.key)} aria-current={s.state === "current" ? "step" : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-strong aria-[current=step]:bg-[var(--brand-soft)]">
            <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm font-semibold ${
              s.state === "done" ? "border-brand bg-brand text-[var(--color-navy-900)]" : s.state === "current" ? "border-accent text-accent" : "border-border text-muted"}`}>
              {s.state === "done" ? <IconCheck className="h-4 w-4" /> : i + 1}
            </span>
            <span className="flex-1">
              <span className="block font-medium">{s.title}</span>
              <span className="block text-xs text-muted">{s.state === "done" ? t.done : s.state === "current" ? t.current : s.state === "later" ? t.later : t.todo}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

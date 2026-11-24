import { useEffect, useState } from "react";
import { dict, type Lang } from "../lib/i18n";
import { currentTheme, setTheme, type Theme } from "../lib/theme";

export function ThemeToggle({ lang }: { lang: Lang }) {
  const t = dict(lang).theme;
  // The real theme is only known in the browser (set by the head script).
  const [theme, set] = useState<Theme>("dark");
  useEffect(() => set(currentTheme()), []);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => { setTheme(next); set(next); }}
      aria-label={next === "light" ? t.toLight : t.toDark}
      aria-pressed={theme === "light"}
      className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-fg transition-colors hover:border-accent hover:text-accent"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <circle cx={12} cy={12} r={4.5} />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}

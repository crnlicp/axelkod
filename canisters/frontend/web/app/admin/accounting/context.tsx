// Ekonomi session: actors, role, master data and the selected fiscal year.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import {
  Role, type Account, type AccountingSettings, type CompanyProfile, type FiscalYear, type Series, type VatCode,
} from "../../bindings/accounting";
import { useAdminLang } from "../i18n";
import { errText, ok, type Accounting, type Vault } from "./api";
import en from "./i18n/en";
import sv, { type AccDict } from "./i18n/sv";

export type AccSession = { acc: Accounting; vault: Vault; role: Role; principal: string };

export type MasterData = {
  company: CompanyProfile | null;
  settings: AccountingSettings;
  lockDate: string | null;
  years: FiscalYear[];
  accounts: Account[];
  vatCodes: VatCode[];
  series: Series[];
};

export type AccContext = AccSession & {
  data: MasterData | null;
  loadError: string | null;
  reload: () => Promise<void>;
  /** The fiscal year chosen in the top bar (?ar=), or the one containing today. */
  year: FiscalYear | null;
  setYear: (y: FiscalYear) => void;
  /** A path inside Ekonomi that keeps the selected year (?ar=). */
  href: (path: string) => string;
  accountName: (n: bigint | number) => string;
  canBook: boolean;
  isOwner: boolean;
  readOnly: boolean;
};

const Ctx = createContext<AccContext | null>(null);

export function useAcc(): AccContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAcc outside the Ekonomi layout");
  return c;
}

export function useAccT(): AccDict {
  return useAdminLang().lang === "en" ? en : sv;
}

/** Errors from canister calls in the user's language. */
export function useErr() {
  const t = useAccT();
  return useCallback((e: unknown) => errText(e, t.errors), [t]);
}

export const today = () => new Date().toLocaleDateString("sv-SE");

/** URL value of a fiscal year: "2026" for a calendar year, else the start month ("2026-07"). */
export const yearKey = (y: FiscalYear) => (y.start.endsWith("-01-01") && y.end.endsWith("-12-31") && y.start.slice(0, 4) === y.end.slice(0, 4) ? y.start.slice(0, 4) : y.start.slice(0, 7));

export function AccProvider({ session, children }: { session: AccSession; children: ReactNode }) {
  const t = useAccT();
  const [data, setData] = useState<MasterData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const { acc, role } = session;

  const reload = useCallback(async () => {
    try {
      const [company, settings, years, accounts, vatCodes, series] = await Promise.all([
        acc.getCompany(), acc.getSettings(), acc.listFiscalYears(), acc.listAccounts(), acc.listVatCodes(), acc.listSeries(),
      ]);
      const s = ok(settings);
      setData({
        company: ok(company) ?? null, settings: s.settings, lockDate: s.lockDate ?? null,
        years: [...ok(years)].sort((a, b) => a.start.localeCompare(b.start)),
        accounts: [...ok(accounts)].sort((a, b) => Number(a.number - b.number)),
        vatCodes: ok(vatCodes), series: ok(series),
      });
      setLoadError(null);
    } catch (e) {
      setLoadError(errText(e, t.errors));
    }
  }, [acc, t]);

  useEffect(() => { void reload(); }, [reload]);

  const value = useMemo<AccContext>(() => {
    const years = data?.years ?? [];
    const key = params.get("ar");
    const d = today();
    const year = years.find((y) => yearKey(y) === key) ?? years.find((y) => y.start <= d && d <= y.end) ?? years.at(-1) ?? null;
    const names = new Map((data?.accounts ?? []).map((a) => [Number(a.number), a.name]));
    return {
      ...session, data, loadError, reload, year,
      setYear: (y) => setParams((p) => { p.set("ar", yearKey(y)); return p; }),
      href: (path) => (key ? `${path}${path.includes("?") ? "&" : "?"}ar=${encodeURIComponent(key)}` : path),
      accountName: (n) => names.get(Number(n)) ?? "",
      canBook: role === Role.owner || role === Role.bookkeeper,
      isOwner: role === Role.owner,
      readOnly: role === Role.auditor,
    };
  }, [session, data, loadError, reload, params, setParams, role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

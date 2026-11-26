import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { Role } from "../../bindings/accounting";
import { ToastProvider } from "../../admin/toast";
import { AdminLangProvider, useAdminLang, type AdminLang } from "../../admin/i18n";
import { AccSessionCtx, AdminCtx, useSession, type AdminContext } from "../../admin/session";
import type { AccSession } from "../../admin/accounting/context";
import accSv from "../../admin/accounting/i18n/sv";
import accEn from "../../admin/accounting/i18n/en";
import { IconArrowRight, IconChart, IconCheck, IconHome, IconCompany, IconCopy, IconInvoice, IconLedger, IconPaperclip, IconParts, IconBank, IconPercent, IconPeople, IconLock, IconLogout, IconMail, IconMenu, IconNews, IconSearch, IconSliders } from "../../components/Icons";
import { LogoSymbol } from "../../components/Logo";

export function meta() {
  return [{ title: "Admin – Axelkod AB" }, { name: "robots", content: "noindex, nofollow" }];
}

function LangSwitch() {
  const { lang, setLang, t } = useAdminLang();
  return (
    <div role="group" aria-label={t.nav.language} className="inline-flex rounded-full border border-border bg-surface p-1 text-sm font-semibold">
      {(["sv", "en"] as AdminLang[]).map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}
          className="rounded-full px-3 py-1 uppercase text-muted transition-colors hover:text-fg aria-pressed:bg-[var(--brand-soft)] aria-pressed:text-accent">
          {l}
        </button>
      ))}
    </div>
  );
}

/** The logo; links to the overview of the current workspace. */
function Brand({ to = "/admin" }: { to?: string }) {
  const { t } = useAdminLang();
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-lg text-fg no-underline" aria-label={`${t.brand} – ${t.nav.overview}`}>
      <LogoSymbol className="h-9 w-auto text-fg" />
      <span className="font-display text-xl font-bold uppercase" aria-hidden="true">{t.brand}</span>
    </Link>
  );
}

/** Signed in, but not an admin (yet): show the ID to send to an admin, with a copy button. */
function RequestAccess({ principal, title, lead, body }: { principal: string; title?: string; lead?: string; body?: string }) {
  const { t } = useAdminLang();
  const a = { ...t.access, ...(title ? { title } : {}), ...(lead ? { lead } : {}), ...(body ? { body } : {}) };
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(principal);
      setCopied("yes");
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopied("failed");
    }
  }
  return (
    <div className="card mx-auto max-w-xl">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--brand-soft)] text-accent"><IconLock className="h-6 w-6" /></span>
        <h1 className="text-3xl uppercase">{a.title}</h1>
      </div>
      <p className="mt-4">{a.lead}</p>
      <p className="mt-2 text-muted">{a.body}</p>
      <p id="principal-label" className="mt-5 text-sm font-medium text-muted">{a.idLabel}</p>
      <div className="mt-1.5 flex items-stretch gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-border bg-bg p-3 font-mono text-sm" data-testid="principal">{principal}</code>
        <button type="button" onClick={() => void copy()} aria-label={a.copy} title={a.copy}
          className="grid w-12 shrink-0 place-items-center rounded-lg border border-border bg-surface text-fg transition-colors hover:border-accent hover:text-accent">
          {copied === "yes" ? <IconCheck className="h-5 w-5 text-accent" /> : <IconCopy className="h-5 w-5" />}
        </button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-muted">
        {copied === "yes" ? a.copied : copied === "failed" ? a.copyFailed : ""}
      </p>
    </div>
  );
}

/** Pre-admin screens (loading, sign-in, request access): top bar only. */
function Shell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3">
          <Brand />
          <div className="flex items-center gap-3"><LangSwitch />{actions}</div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}

const link =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium text-fg no-underline transition-colors hover:bg-surface-strong aria-[current=page]:bg-[var(--brand-soft)] aria-[current=page]:text-accent";

type NavItem = { to: string; end?: boolean; label: string; icon: (p: { className?: string }) => ReactNode; badge?: number | null };
type NavGroup = { title?: string; items: NavItem[] };

/** Workspace switch: shown only to users with access to both. */
function WorkspaceSwitch({ current }: { current: "site" | "accounting" }) {
  const { lang } = useAdminLang();
  const w = (lang === "en" ? accEn : accSv).workspace;
  return (
    <nav aria-label={w.label} className="grid grid-cols-2 rounded-full border border-border bg-surface p-1 text-sm font-semibold">
      {(["site", "accounting"] as const).map((k) => (
        <Link key={k} to={k === "site" ? "/admin" : "/admin/accounting"} aria-current={current === k ? "page" : undefined}
          className="rounded-full px-3 py-1.5 text-center text-muted no-underline hover:text-fg aria-[current=page]:bg-[var(--brand-soft)] aria-[current=page]:text-accent">
          {w[k]}
        </Link>
      ))}
    </nav>
  );
}

function siteNav(t: ReturnType<typeof useAdminLang>["t"], unread: number | null): NavGroup[] {
  return [{ items: [
    { to: "/admin", end: true, label: t.nav.overview, icon: IconChart },
    { to: "/admin/inbox", label: t.nav.inbox, icon: IconMail, badge: unread },
    { to: "/admin/home", label: t.nav.home, icon: IconHome },
    { to: "/admin/news", label: t.nav.news, icon: IconNews },
    { to: "/admin/contact", label: t.nav.contact, icon: IconCompany },
    { to: "/admin/seo", label: t.nav.seo, icon: IconSearch },
    { to: "/admin/settings", label: t.nav.settings, icon: IconSliders },
  ] }];
}

/** Ekonomi navigation by how often the work happens; filtered by role (the canister enforces it too). */
function accountingNav(lang: AdminLang, role: Role, modules: { payroll: boolean; rotRut: boolean }): NavGroup[] {
  const n = (lang === "en" ? accEn : accSv).nav;
  const books = role !== Role.payroll;
  // Lön is hidden until the module is on (D7); the payroll role always sees it.
  const pay = role === Role.payroll || (modules.payroll && (role === Role.owner || role === Role.auditor));
  const hus = books && modules.rotRut;
  return [
    { items: [{ to: "/admin/accounting", end: true, label: n.overview, icon: IconChart }] },
    ...(books ? [{ title: n.groupDaily, items: [
      { to: "/admin/accounting/sales", label: n.sales, icon: IconInvoice },
      { to: "/admin/accounting/purchases", label: n.purchases, icon: IconPaperclip },
      { to: "/admin/accounting/bank", label: n.bank, icon: IconBank },
      { to: "/admin/accounting/ledger", label: n.ledger, icon: IconLedger },
    ] }] : []),
    ...(books || pay ? [{ title: n.groupPeriods, items: [
      ...(books ? [{ to: "/admin/accounting/vat", label: n.vat, icon: IconPercent }] : []),
      ...(pay ? [{ to: "/admin/accounting/payroll", label: n.payroll, icon: IconPeople }] : []),
      ...(hus ? [{ to: "/admin/accounting/rot-rut", label: n.rotRut, icon: IconHome }] : []),
    ] }] : []),
    ...(books ? [{ title: n.groupRegisters, items: [{ to: "/admin/accounting/assets", label: n.assets, icon: IconParts }] }] : []),
    { items: [
      { to: "/admin/accounting/guide", label: n.guide, icon: IconNews },
      { to: "/admin/accounting/settings", label: n.settings, icon: IconSliders },
    ] },
  ];
}

/** Signed-in admin: sidebar navigation (a drawer below lg). */
function AdminShell({ groups, workspace, both, onSignOut, children }: {
  groups: NavGroup[]; workspace: "site" | "accounting"; both: boolean; onSignOut: () => void; children: ReactNode;
}) {
  const { t } = useAdminLang();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-bg px-5 py-3 lg:hidden">
        <Brand to={workspace === "site" ? "/admin" : "/admin/accounting"} />
        <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface"
          aria-expanded={open} aria-controls="admin-sidebar" aria-label={t.nav.menu} onClick={() => setOpen(!open)}>
          <IconMenu className="h-5 w-5" />
        </button>
      </header>
      <aside id="admin-sidebar"
        className={`${open ? "flex" : "hidden"} flex-col gap-6 overflow-y-auto border-b border-border bg-bg p-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:border-r lg:border-b-0`}>
        <div className="hidden lg:block"><Brand to={workspace === "site" ? "/admin" : "/admin/accounting"} /></div>
        {both && <WorkspaceSwitch current={workspace} />}
        <nav aria-label={t.nav.label} className="space-y-4">
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.title && <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted">{g.title}</p>}
              <ul className="space-y-1">
                {g.items.map(({ to, end, label, icon: Icon, badge }) => (
                  <li key={to}>
                    <NavLink to={to} end={end} className={link}>
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{label}</span>
                      {badge ? (
                        <span className="rounded-full bg-[var(--color-teal-500)] px-2 py-0.5 text-xs font-semibold text-[var(--color-navy-900)]" aria-label={t.nav.unread(badge)}>{badge}</span>
                      ) : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-auto space-y-4 border-t border-border pt-5">
          <LangSwitch />
          <a href="/" className="btn btn-secondary w-full justify-center">{t.nav.viewSite} <IconArrowRight className="h-5 w-5" /></a>
          <button type="button" className="btn btn-secondary w-full justify-center" onClick={onSignOut}>
            <IconLogout className="h-5 w-5" /> {t.nav.signOut}
          </button>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-5 py-8 lg:px-10">
        {/* Ekonomi sets its own width: its header spans the whole content area. */}
        {workspace === "accounting" ? children : <div className="mx-auto max-w-6xl">{children}</div>}
      </main>
    </div>
  );
}

export default function AdminLayout() {
  return (
    <AdminLangProvider>
      <ToastProvider>
      <AdminRoot />
      </ToastProvider>
    </AdminLangProvider>
  );
}

function AdminRoot() {
  const { t, lang } = useAdminLang();
  const { session, signIn, signOut } = useSession();
  const { pathname } = useLocation();
  const [unread, setUnread] = useState<number | null>(null);
  const [unreadTick, setUnreadTick] = useState(0);
  const refreshUnread = useCallback(() => setUnreadTick((n) => n + 1), []);

  const ctx = useMemo<AdminContext | null>(
    () => (session.state === "admin" && session.site ? { actor: session.site, identity: session.identity, principal: session.principal, refreshUnread, setUnread } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.state === "admin" ? session.principal : null, session.state === "admin" && !!session.site, unreadTick],
  );
  const accSession = session.state === "admin" ? session.accounting : null;
  const acc = useMemo<AccSession | null>(() => accSession, // eslint-disable-line react-hooks/exhaustive-deps
    [accSession?.principal, accSession?.role]);
  // The module flags (D7); re-read on navigation so turning one on in settings shows it.
  const [modules, setModules] = useState({ payroll: false, rotRut: false });
  useEffect(() => {
    if (!acc || !pathname.startsWith("/admin/accounting")) return;
    acc.acc.getSettings().then((r) => { if (r.__kind__ === "ok") setModules({ payroll: r.ok.settings.modules.payroll, rotRut: r.ok.settings.modules.rotRut }); }).catch(() => {});
  }, [acc, pathname]);

  if (session.state === "loading") {
    return <Shell><p role="status">{t.loading}</p></Shell>;
  }

  if (session.state === "signed-out") {
    return (
      <Shell>
        <div className="card mx-auto max-w-md text-center">
          <h1 className="text-3xl uppercase">{t.login.title}</h1>
          <p className="mt-2 text-muted">{t.login.intro}</p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => void signIn()}>{t.login.button}</button>
          {session.error && <p role="alert" className="mt-4 text-sm text-[var(--error)]">{t.login.failed(session.error)}</p>}
        </div>
      </Shell>
    );
  }

  if (session.state === "denied") {
    return (
      <Shell actions={<button type="button" className="btn btn-secondary" onClick={() => void signOut()}>{t.nav.signOut}</button>}>
        <RequestAccess principal={session.principal} />
      </Shell>
    );
  }

  const workspace = pathname.startsWith("/admin/accounting") ? "accounting" : "site";
  // Accounting-only users never see the website admin; site-only admins never see Ekonomi.
  if (workspace === "site" && !session.site) return <Navigate to="/admin/accounting" replace />;
  const groups = workspace === "site" ? siteNav(t, unread) : acc ? accountingNav(lang, acc.role, modules) : [];
  const a = (lang === "en" ? accEn : accSv).shell;

  return (
    <AdminCtx.Provider value={ctx}>
      <AccSessionCtx.Provider value={acc}>
        <AdminShell groups={groups} workspace={workspace} both={!!session.site && !!acc} onSignOut={() => void signOut()}>
          {workspace === "accounting" && !acc
            ? <div className="mx-auto max-w-6xl"><RequestAccess principal={session.principal} title={a.noAccess} lead={a.noAccess} body={a.noAccessBody} /></div>
            : <Outlet />}
        </AdminShell>
      </AccSessionCtx.Provider>
    </AdminCtx.Provider>
  );
}

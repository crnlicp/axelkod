import { useCallback, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { AdminCtx, useSession, type AdminContext } from "../../admin/session";
import { LogoSymbol } from "../../components/Logo";

export function meta() {
  return [{ title: "Admin – Axelkod AB" }, { name: "robots", content: "noindex, nofollow" }];
}

function Shell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <LogoSymbol className="h-9 w-auto text-fg" />
            <span className="font-display text-xl font-bold uppercase">Axelkod admin</span>
          </div>
          {actions}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}

export default function AdminLayout() {
  const { session, signIn, signOut } = useSession();
  const [unread, setUnread] = useState<number | null>(null);
  const [unreadTick, setUnreadTick] = useState(0);
  const refreshUnread = useCallback(() => setUnreadTick((t) => t + 1), []);

  const ctx = useMemo<AdminContext | null>(
    () => (session.state === "admin" ? { actor: session.actor, identity: session.identity, principal: session.principal, refreshUnread, setUnread } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.state === "admin" ? session.principal : null, unreadTick],
  );

  if (session.state === "loading") {
    return <Shell><p role="status">Laddar…</p></Shell>;
  }

  if (session.state === "signed-out") {
    return (
      <Shell>
        <div className="card mx-auto max-w-md text-center">
          <h1 className="text-3xl uppercase">Logga in</h1>
          <p className="mt-2 text-muted">Administratörer loggar in med Internet Identity (passkey).</p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => void signIn()}>
            Logga in med Internet Identity
          </button>
          {session.error && <p role="alert" className="mt-4 text-sm text-[var(--error)]">Inloggningen misslyckades: {session.error}</p>}
        </div>
      </Shell>
    );
  }

  if (session.state === "denied") {
    return (
      <Shell actions={<button type="button" className="btn btn-secondary" onClick={() => void signOut()}>Logga ut</button>}>
        <div className="card mx-auto max-w-xl">
          <h1 className="text-3xl uppercase">Åtkomst nekad</h1>
          <p className="mt-2">Den här identiteten är inte administratör. Be en befintlig administratör (eller den som driftsätter sajten) att lägga till ditt ID:</p>
          <p className="mt-3 break-all rounded bg-bg p-3 font-mono text-sm" data-testid="principal">{session.principal}</p>
        </div>
      </Shell>
    );
  }

  const tab = "rounded px-3 py-2 font-medium text-fg no-underline aria-[current=page]:bg-surface aria-[current=page]:text-accent";
  return (
    <AdminCtx.Provider value={ctx}>
      <Shell
        actions={
          <div className="flex items-center gap-3">
            <nav aria-label="Admin" className="flex gap-1">
              <NavLink to="/admin" end className={tab}>
                Inkorg{unread ? <span className="ml-1.5 rounded-full bg-[var(--color-teal-500)] px-2 py-0.5 text-xs font-semibold text-[var(--color-navy-900)]" aria-label={`${unread} olästa`}>{unread}</span> : null}
              </NavLink>
              <NavLink to="/admin/contact" className={tab}>Kontaktuppgifter</NavLink>
              <NavLink to="/admin/seo" className={tab}>SEO</NavLink>
            </nav>
            <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>Logga ut</button>
          </div>
        }
      >
        <Outlet />
      </Shell>
    </AdminCtx.Provider>
  );
}

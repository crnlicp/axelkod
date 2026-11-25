import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Identity } from "@icp-sdk/core/agent";
import type { Site } from "../bindings/site";
import { accountingActors } from "./accounting/api";
import type { AccSession } from "./accounting/context";
import { forgetKeys } from "./accounting/keycache";
import { adminActor, authClient } from "./auth";

export type Session =
  | { state: "loading" }
  | { state: "signed-out"; error?: string }
  | { state: "denied"; principal: string }
  /** Signed in with access to at least one workspace: the website (site admin) or Ekonomi (a role). */
  | { state: "admin"; principal: string; identity: Identity; site: Site | null; accounting: AccSession | null };

export function useSession() {
  const [session, setSession] = useState<Session>({ state: "loading" });

  const resolve = useCallback(async () => {
    const auth = authClient();
    if (!auth.isAuthenticated()) return setSession({ state: "signed-out" });
    try {
      const identity = await auth.getIdentity();
      const actor = adminActor(identity);
      const accs = accountingActors(identity);
      // The canisters decide who may do what; the UI only reflects it. signIn also
      // records the login in Ekonomi's audit log. Either workspace may be unreachable.
      const [me, accMe] = await Promise.all([
        actor.whoami(),
        accs ? accs.acc.signIn().catch(() => null) : Promise.resolve(null),
      ]);
      const principal = me.principal.toText();
      const accounting = accs && accMe?.role ? { ...accs, role: accMe.role, principal } : null;
      setSession(me.isAdmin || accounting
        ? { state: "admin", principal, identity, site: me.isAdmin ? actor : null, accounting }
        : { state: "denied", principal });
    } catch (e) {
      setSession({ state: "signed-out", error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void resolve();
    // Fires on sign-in/out and expiry, also from other tabs.
    return authClient().subscribe(() => void resolve());
  }, [resolve]);

  const signIn = useCallback(async () => {
    try {
      await authClient().signIn();
      await resolve();
    } catch (e) {
      setSession({ state: "signed-out", error: e instanceof Error ? e.message : String(e) });
    }
  }, [resolve]);

  const signOut = useCallback(async () => {
    forgetKeys();
    await authClient().signOut();
    setSession({ state: "signed-out" });
  }, []);

  return { session, signIn, signOut };
}

/** Ekonomi actors and role for the signed-in user, when they have an accounting role. */
export const AccSessionCtx = createContext<AccSession | null>(null);

export type AdminContext = { actor: Site; identity: Identity; principal: string; refreshUnread: () => void; setUnread: (n: number) => void };
export const AdminCtx = createContext<AdminContext | null>(null);

export function useAdmin(): AdminContext {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error("useAdmin outside the admin layout");
  return ctx;
}

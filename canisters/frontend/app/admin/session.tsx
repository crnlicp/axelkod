import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Backend } from "../bindings/backend";
import { adminActor, authClient } from "./auth";

export type Session =
  | { state: "loading" }
  | { state: "signed-out"; error?: string }
  | { state: "denied"; principal: string }
  | { state: "admin"; principal: string; actor: Backend };

export function useSession() {
  const [session, setSession] = useState<Session>({ state: "loading" });

  const resolve = useCallback(async () => {
    const auth = authClient();
    if (!auth.isAuthenticated()) return setSession({ state: "signed-out" });
    try {
      const actor = adminActor(await auth.getIdentity());
      // The canister decides who is an admin; the UI only reflects it.
      const me = await actor.whoami();
      const principal = me.principal.toText();
      setSession(me.isAdmin ? { state: "admin", principal, actor } : { state: "denied", principal });
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
    await authClient().signOut();
    setSession({ state: "signed-out" });
  }, []);

  return { session, signIn, signOut };
}

export type AdminContext = { actor: Backend; principal: string; refreshUnread: () => void; setUnread: (n: number) => void };
export const AdminCtx = createContext<AdminContext | null>(null);

export function useAdmin(): AdminContext {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error("useAdmin outside the admin layout");
  return ctx;
}

// Actors for the accounting and vault canisters, and Result handling.
import type { Identity } from "@icp-sdk/core/agent";
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";
import { createActor as createAccounting, type Accounting, type Error_ as AccError } from "../../bindings/accounting";
import { createActor as createVault, type Vault } from "../../bindings/vault";

export type { Accounting, Vault };

const env = safeGetCanisterEnv();

export function accountingActors(identity: Identity): { acc: Accounting; vault: Vault } | null {
  const acc = env?.["PUBLIC_CANISTER_ID:accounting"];
  const vault = env?.["PUBLIC_CANISTER_ID:vault"];
  if (!acc || !vault) return null;
  const agentOptions = { identity, rootKey: env?.IC_ROOT_KEY };
  return { acc: createAccounting(acc, { agentOptions }), vault: createVault(vault, { agentOptions }) };
}

type R<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: AccError };

/** Thrown for a canister `#err`, so pages can show `errText(e.err)`. */
export class AccountingError extends Error {
  constructor(readonly err: AccError) {
    super(err.__kind__);
  }
}

export function ok<T>(r: R<T>): T {
  if (r.__kind__ === "err") throw new AccountingError(r.err);
  return r.ok;
}

export type ErrTexts = {
  notAuthorized: string; notFound: string; lastOwner: string;
  invalid: (field: string) => string; conflict: (m: string) => string; locked: (m: string) => string;
  vault: (m: string) => string; keys: (m: string) => string; network: (m: string) => string;
  fields: Record<string, string>;
};

export function errText(e: unknown, t: ErrTexts): string {
  if (!(e instanceof AccountingError)) return t.network(e instanceof Error ? e.message : String(e));
  const x = e.err;
  switch (x.__kind__) {
    case "notAuthorized": return t.notAuthorized;
    case "notFound": return t.notFound;
    case "lastOwner": return t.lastOwner;
    case "invalid": return t.invalid(t.fields[x.invalid] ?? t.fields[x.invalid.replace(/\[\d+\]/, "[]")] ?? x.invalid);
    case "conflict": return t.conflict(x.conflict);
    case "locked": return t.locked(t.fields[x.locked] ?? x.locked);
    case "vault": return t.vault(x.vault);
    case "keys": return t.keys(x.keys);
  }
}

/** The invalid field name of a canister error, for inline field errors. */
export const errField = (e: unknown): string | null =>
  e instanceof AccountingError && e.err.__kind__ === "invalid" ? e.err.invalid : null;

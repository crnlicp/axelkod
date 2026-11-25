// Node-side Ekonomi owner for tests: a fixed throwaway Ed25519 key, made first owner
// through the install argument (works only while accounting has no roles).
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Principal } from "@icp-sdk/core/principal";
import { createHash } from "node:crypto";
import { Role, createActor } from "../../app/bindings/accounting";
import { agentOptions, icp, ids } from "./local";

const seed = createHash("sha256").update("axelkod-local-accounting-owner").digest();
export const ownerId = Ed25519KeyIdentity.generate(new Uint8Array(seed));
export const owner = createActor(ids.accounting, { agentOptions: { ...agentOptions, identity: ownerId } });

export const ok = <T>(r: { __kind__: "ok"; ok: T } | { __kind__: "err"; err: unknown }): T => {
  if (r.__kind__ !== "ok") throw new Error(JSON.stringify(r.err, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  return r.ok;
};

/** Makes the fixed key an owner (first install only) and ensures a fiscal year containing today. */
export async function ensureOwnerAndYear(): Promise<bigint> {
  if ((await owner.me()).role !== Role.owner) {
    icp("canister", "install", "accounting", "--mode", "upgrade", "--args", `(opt principal "${ownerId.getPrincipal().toText()}")`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const y = new Date().getUTCFullYear();
  const years = ok(await owner.listFiscalYears());
  const current = years.find((x) => x.start <= today && today <= x.end);
  return current ? current.id : ok(await owner.createFiscalYear(`${y}-01-01`, `${y}-12-31`, false)).id;
}

export async function grant(principal: string, role: Role) {
  ok(await owner.setRole(Principal.fromText(principal), role));
  return () => owner.removeRole(Principal.fromText(principal)).then(ok);
}

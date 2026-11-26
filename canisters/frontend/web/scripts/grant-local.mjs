// LOCAL ONLY: gives a principal (the one shown on /admin after sign-in) a role in the
// local accounting canister. It acts as the fixed test owner key from
// tests/support/accounting.ts, which the install argument makes the first owner.
// Usage: pnpm grant:local [principal] [owner|bookkeeper|payroll|auditor]
// Without arguments it asks for both.
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Principal } from "@icp-sdk/core/principal";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { idlFactory } from "../app/bindings/declarations/accounting.did.js";

const roles = ["owner", "bookkeeper", "payroll", "auditor"];
let [principal, role] = process.argv.slice(2).filter((a) => a !== "--");
if (!principal) {
  // An async line iterator keeps lines buffered, so piped input works as well as a terminal.
  const rl = createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q) => { process.stdout.write(q); return ((await lines.next()).value ?? "").trim(); };
  principal = await ask("Principal (shown on /admin after sign-in): ");
  role ??= (await ask(`Role [${roles.join("|")}] (owner): `)) || "owner";
  rl.close();
}
role ||= "owner";
if (!principal || !roles.includes(role)) {
  console.error(`Usage: pnpm grant:local [principal] [${roles.join("|")}]`);
  process.exit(1);
}
const target = Principal.fromText(principal);

const root = new URL("../../../../", import.meta.url).pathname;
const run = (...args) => execFileSync("icp", args, { cwd: root, encoding: "utf8" });
const icp = (...args) => run(...args, "--identity", "anonymous");
const net = JSON.parse(run("network", "status", "--json"));
if (!/127\.0\.0\.1|localhost/.test(net.api_url)) throw new Error(`Not a local network: ${net.api_url}`);
const ids = JSON.parse(readFileSync(`${root}.icp/cache/mappings/local.ids.json`, "utf8"));

const seed = createHash("sha256").update("axelkod-local-accounting-owner").digest();
const identity = Ed25519KeyIdentity.generate(new Uint8Array(seed));
const agent = await HttpAgent.create({ host: net.api_url, identity, rootKey: Uint8Array.from(Buffer.from(net.root_key, "hex")) });
const acc = Actor.createActor(idlFactory, { agent, canisterId: ids.accounting });

if (!("owner" in ((await acc.me()).role[0] ?? {}))) {
  // Takes effect only while the canister has no roles yet.
  icp("canister", "install", "accounting", "--mode", "upgrade", "--args", `(opt principal "${identity.getPrincipal().toText()}")`);
  if (!("owner" in ((await acc.me()).role[0] ?? {}))) throw new Error("The test owner key is not an owner here, and accounting already has roles.");
}
const r = await acc.setRole(target, { [role]: null });
if ("err" in r) throw new Error(`setRole failed: ${JSON.stringify(r.err)}`);
console.log(`${principal} is now ${role} in local accounting (${ids.accounting}).`);

// Admin API against the local network, as a real (non-anonymous) admin.
// Signs with a throwaway in-memory Ed25519 key that the local controller
// (anonymous) makes an admin for the duration of the test. Browser login is
// covered by tests/e2e/admin-login.spec.ts.
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createActor, Status, Area, Lang, type Site } from "../../app/bindings/site";

const root = new URL("../../../../../", import.meta.url).pathname;
const icp = (...args: string[]) => execFileSync("icp", [...args, "--identity", "anonymous"], { cwd: root, encoding: "utf8" });

const net = JSON.parse(execFileSync("icp", ["network", "status", "--json"], { cwd: root, encoding: "utf8" }));
const ids = JSON.parse(readFileSync(`${root}/.icp/cache/mappings/local.ids.json`, "utf8"));
const agentOptions = { host: net.api_url, rootKey: Uint8Array.from(Buffer.from(net.root_key, "hex")) };

const identity = Ed25519KeyIdentity.generate();
const principal = identity.getPrincipal().toText();
let admin: Site;
const anon = createActor(ids.site, { agentOptions });

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  expect(icp("canister", "call", "site", "addAdmin", `(principal "${principal}")`)).toContain("ok");
  admin = createActor(ids.site, { agentOptions: { ...agentOptions, identity } });
});

test.afterAll(() => {
  icp("canister", "call", "site", "removeAdmin", `(principal "${principal}")`);
});

test("whoami: admin vs anonymous", async () => {
  expect((await admin.whoami()).isAdmin).toBe(true);
  expect((await anon.whoami()).isAdmin).toBe(false);
});

test("inbox: submit, list, search, status, note, export, delete", async () => {
  const marker = `api-${Date.now()}`;
  const tok = await anon.getFormToken(`nonce${marker}`.replace(/[^\w-]/g, "").padEnd(16, "x"));
  if (tok.__kind__ !== "ok") throw new Error(tok.err.__kind__);
  await new Promise((r) => setTimeout(r, 3_100));
  const sub = await anon.submitContact(
    { name: "API Test", email: `${marker}@example.se`, company: "=HYPERLINK(1)", area: Area.security, message: `Hej ${marker}`, lang: Lang.sv, consent: true, website: "" },
    tok.ok,
  );
  if (sub.__kind__ !== "ok") throw new Error(sub.err.__kind__);
  const id = sub.ok;

  const found = await admin.listMessages({ search: marker }, { offset: 0n, limit: 10n });
  if (found.__kind__ !== "ok") throw new Error(found.err.__kind__);
  expect(found.ok.total).toBe(1n);
  expect(found.ok.items[0].status).toBe(Status.new);

  expect((await admin.setStatus(id, Status.handled)).__kind__).toBe("ok");
  expect((await admin.setNote(id, "  Ringde kunden.\n ")).__kind__).toBe("ok");
  const after = await admin.listMessages({ search: marker, status: Status.handled }, { offset: 0n, limit: 10n });
  if (after.__kind__ !== "ok") throw new Error(after.err.__kind__);
  expect(after.ok.items[0].adminNote).toBe("Ringde kunden.");

  const csv = await admin.exportMessagesCsv();
  if (csv.__kind__ !== "ok") throw new Error(csv.err.__kind__);
  expect(csv.ok).toContain(`"${marker}@example.se"`);
  expect(csv.ok).toContain(`"'=HYPERLINK(1)"`); // formula neutralised

  expect((await admin.deleteMessage(id)).__kind__).toBe("ok");
  expect((await admin.deleteMessage(id))).toMatchObject({ __kind__: "err", err: { __kind__: "notFound" } });
});

test("settings round-trip and public config", async () => {
  const cur = await admin.getContactInfo();
  if (cur.__kind__ !== "ok") throw new Error(cur.err.__kind__);
  const set = await admin.setContactInfo({ ...cur.ok, email: "INFO@axelkod.eu ".trim(), phone: "031-00 00 00", showPhone: false });
  expect(set.__kind__).toBe("ok");
  const pub = await anon.getPublicConfig();
  expect(pub.contact.email).toBe("INFO@axelkod.eu");
  expect(pub.contact.phone).toBeUndefined(); // hidden by showPhone = false
  expect((await admin.setContactInfo(cur.ok)).__kind__).toBe("ok"); // restore
  expect((await anon.setContactInfo(cur.ok))).toMatchObject({ __kind__: "err", err: { __kind__: "notAuthorized" } });
});

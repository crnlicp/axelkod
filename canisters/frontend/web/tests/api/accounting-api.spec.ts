// Accounting + vault against the local network: roles, seed, fiscal year,
// gapless posting, corrections, an encrypted-style attachment through the vault,
// the audit chain and a real vetKey derivation.
// The local owner is a fixed throwaway Ed25519 key, made first owner through the
// install argument (works only while accounting has no roles).
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { DerivedPublicKey, EncryptedVetKey, TransportSecretKey } from "@icp-sdk/vetkeys";
import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { Role, Variant_scan_email_upload, createActor as createAccounting, type Accounting, type VoucherLine } from "../../app/bindings/accounting";
import { createActor as createVault } from "../../app/bindings/vault";
import { agentOptions, icp, ids } from "../support/local";

const sha256 = (b: Uint8Array) => new Uint8Array(createHash("sha256").update(b).digest());
const ownerId = Ed25519KeyIdentity.generate(sha256(new TextEncoder().encode("axelkod-local-accounting-owner")));
const owner = createAccounting(ids.accounting, { agentOptions: { ...agentOptions, identity: ownerId } });
const anon = createAccounting(ids.accounting, { agentOptions });

function as(identity: Ed25519KeyIdentity) {
  return {
    acc: createAccounting(ids.accounting, { agentOptions: { ...agentOptions, identity } }),
    vault: createVault(ids.vault, { agentOptions: { ...agentOptions, identity } }),
  };
}

const ok = <T>(r: { __kind__: "ok"; ok: T } | { __kind__: "err"; err: unknown }): T => {
  if (r.__kind__ !== "ok") throw new Error(JSON.stringify(r.err, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  return r.ok;
};

const line = (account: number, amount: bigint): VoucherLine => ({ account: BigInt(account), amount });
const year = new Date().getUTCFullYear();
const today = new Date().toISOString().slice(0, 10);
let fiscalYearId = 0n;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if ((await owner.me()).role !== Role.owner) {
    icp("canister", "install", "accounting", "--mode", "upgrade", "--args", `(opt principal "${ownerId.getPrincipal().toText()}")`);
  }
  expect((await owner.me()).role).toBe(Role.owner);
  const years = ok(await owner.listFiscalYears());
  const current = years.find((y) => y.start <= today && today <= y.end);
  fiscalYearId = current ? current.id : ok(await owner.createFiscalYear(`${year}-01-01`, `${year}-12-31`, false)).id;
});

test("anonymous and unknown principals get no access", async () => {
  expect((await anon.me()).role).toBeUndefined();
  const stranger = as(Ed25519KeyIdentity.generate()).acc;
  expect((await stranger.listAccounts()).__kind__).toBe("err");
  expect((await stranger.signIn()).role).toBeUndefined();
});

test("seed: BAS accounts, VAT codes and series", async () => {
  const accounts = ok(await owner.listAccounts());
  expect(accounts.find((a) => a.number === 1930n)?.name).toBe("Företagskonto");
  expect(accounts.find((a) => a.number === 2611n)?.name).toBe("Utgående moms på försäljning inom Sverige, 25 %");
  expect(ok(await owner.listVatCodes()).find((c) => c.code === "U25")?.rateBp).toBe(2500n);
  expect(ok(await owner.listSeries()).map((s) => s.code).sort()).toEqual(["A", "B", "C", "F", "L", "M", "P", "X"]);
});

test("posting is balanced and gapless; a correction reverses and links", async () => {
  const sale = { series: "A", eventDate: today, description: "Testförsäljning", attachmentIds: [], counterparty: "Kund AB" };
  const lines = [line(1930, 12_500n), line(3001, -10_000n), { ...line(2611, -2_500n), vatCode: "U25" }];
  const bad = await owner.postVoucher({ ...sale, lines: [line(1930, 100n), line(3001, -99n)] });
  expect(bad.__kind__ === "err" && bad.err).toEqual({ __kind__: "invalid", invalid: "unbalanced" });

  const a = ok(await owner.postVoucher({ ...sale, lines }));
  const b = ok(await owner.postVoucher({ ...sale, lines }));
  expect(b.number).toBe(a.number + 1n);
  expect(a.retainUntil).toBe(`${year + 7}-12-31`);

  const fix = ok(await owner.correctVoucher(a.id, today, "Rättelse av testförsäljning", null));
  expect(fix.series).toBe("C");
  expect(fix.corrects).toBe(a.id);
  expect(fix.lines.map((l) => l.amount)).toEqual(lines.map((l) => -l.amount));
  expect(ok(await owner.getVoucher(a.id)).correctedBy).toContain(fix.id);

  const page = ok(await owner.journal(fiscalYearId, "A", 0n, 200n));
  const numbers = page.items.map((v) => v.number);
  expect(numbers).toEqual(numbers.map((_, i) => BigInt(i + 1)));
});

test("drafts take no number until posted", async () => {
  const before = ok(await owner.journal(fiscalYearId, "A", 0n, 1n)).total;
  const d = ok(await owner.saveDraft(null, { series: "A", eventDate: today, description: "Utkast", lines: [line(6110, 500n), line(1930, -500n)], attachmentIds: [] }));
  expect(ok(await owner.journal(fiscalYearId, "A", 0n, 1n)).total).toBe(before);
  const v = ok(await owner.postDraft(d.id));
  expect(v.number).toBe(before + 1n);
  expect(ok(await owner.listDrafts()).find((x) => x.id === d.id)).toBeUndefined();
});

test("roles: mirrored to the vault, permissions, last owner kept", async () => {
  const bkId = Ed25519KeyIdentity.generate();
  const audId = Ed25519KeyIdentity.generate();
  expect(ok(await owner.setRole(bkId.getPrincipal(), Role.bookkeeper)).mirrored).toBe(true);
  expect(ok(await owner.setRole(audId.getPrincipal(), Role.auditor)).mirrored).toBe(true);
  const bk = as(bkId);
  const aud = as(audId);
  try {
    expect(await bk.vault.myRole()).toBe(Role.bookkeeper);
    const v = await bk.acc.postVoucher({ series: "A", eventDate: today, description: "Bokförare", lines: [line(6110, 100n), line(1930, -100n)], attachmentIds: [] });
    expect(v.__kind__).toBe("ok");
    const denied = await aud.acc.postVoucher({ series: "A", eventDate: today, description: "Revisor", lines: [line(6110, 100n), line(1930, -100n)], attachmentIds: [] });
    expect(denied.__kind__ === "err" && denied.err.__kind__).toBe("notAuthorized");
    expect((await aud.acc.journal(fiscalYearId, null, 0n, 1n)).__kind__).toBe("ok");
    expect((await bk.acc.setLockDate("2000-01-01")).__kind__).toBe("err");
    const last = await owner.removeRole(ownerId.getPrincipal());
    expect(last.__kind__ === "err" && last.err.__kind__).toBe("lastOwner");

    // Attachment: vault upload (ciphertext) → confirm in accounting → link on a voucher.
    const cipher = randomBytes(1000);
    const upload = ok(await bk.vault.beginUpload({ mime: "application/pdf", size: 1000n, chunkCount: 1n, cipherSha256: sha256(cipher) }));
    ok(await bk.vault.putChunk(upload, 0n, cipher));
    const file = ok(await bk.vault.finalize(upload));
    const ticket = ok(await bk.acc.beginAttachment({
      filename: "kvitto.pdf", mime: "application/pdf", size: 972n, plainSha256: sha256(randomBytes(8)),
      wrappedKey: randomBytes(60), keyId: "docs-v1", receivedVia: Variant_scan_email_upload.upload,
    }));
    const att = ok(await bk.acc.confirmAttachment(ticket, file.id));
    expect(att.vaultFileId).toBe(file.id);
    const again = await bk.acc.confirmAttachment(ticket, file.id);
    expect(again.__kind__).toBe("err");
    const withFile = ok(await bk.acc.postVoucher({ series: "A", eventDate: today, description: "Kvitto", lines: [line(6110, 972n), line(1930, -972n)], attachmentIds: [att.id] }));
    expect(withFile.attachmentIds).toEqual([att.id]);
    expect(Buffer.from(ok(await aud.vault.getChunk(file.id, 0n))).equals(cipher)).toBe(true);
    const ownerVault = as(ownerId).vault;
    expect((await ownerVault.getChunk(file.id, 1n)).__kind__).toBe("err");
  } finally {
    ok(await owner.removeRole(bkId.getPrincipal()));
    ok(await owner.removeRole(audId.getPrincipal()));
  }
  expect(await bk.vault.myRole()).toBeNull();
});

test("audit chain is intact and records the postings", async () => {
  const log = ok(await owner.auditLog(0n, 50n));
  expect(log.total).toBeGreaterThan(5n);
  expect(log.items.map((e) => e.action)).toContain("voucher.correct");
  expect(ok(await owner.verifyAudit(0n))).toBeNull();
});

test("vetKey: derived for an allowed purpose and verified in the browser library", async () => {
  const pk = ok(await owner.vetkdPublicKey());
  const tsk = TransportSecretKey.random();
  const enc = ok(await owner.deriveKey("docs-v1", tsk.publicKeyBytes()));
  // vetkd_public_key with our context already returns the canister's derived key.
  const dpk = DerivedPublicKey.deserialize(Uint8Array.from(pk));
  const key = EncryptedVetKey.deserialize(Uint8Array.from(enc)).decryptAndVerify(tsk, dpk, new TextEncoder().encode("docs-v1"));
  expect(key.signatureBytes().length).toBe(48);
  expect((await owner.deriveKey("other", tsk.publicKeyBytes())).__kind__).toBe("err");
});

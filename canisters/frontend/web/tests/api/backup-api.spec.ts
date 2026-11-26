// Full backup and restore (A9c, spec §10) on two extra local pairs from icp.yaml: `backup` is
// reinstalled, filled (company, year, voucher with a real encrypted attachment, an employee
// with encrypted personal data) and backed up; `restore` is reinstalled empty and the backup
// restored into it. Records come back verbatim, the audit chain verifies, the attachment
// and personnummer decrypt under the new canister's keys, and the SIE 4 files match.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createActor, Variant_scan_email_upload, type EmployeeInput } from "../../app/bindings/accounting";
import { createActor as createVault } from "../../app/bindings/vault";
import { createBackup, readBackup, restoreBackup, seal, sieFile, strength, toJson, unseal, fromJson } from "../../app/admin/accounting/backup";
import { openDocument, uploadDocument } from "../../app/admin/accounting/crypto";
import { forgetKeys } from "../../app/admin/accounting/keycache";
import { allVouchers } from "../../app/admin/accounting/ledger";
import { decryptPii, encryptPii } from "../../app/admin/accounting/payroll";
import { decode437, parseSie } from "../../app/admin/accounting/sie4";
import { ok, ownerId } from "../support/accounting";
import { agentOptions, icp, root } from "../support/local";

test.describe.configure({ mode: "serial", timeout: 300_000 });

const pair = (env: string) => {
  const ids = JSON.parse(readFileSync(`${root}/.icp/cache/mappings/${env}.ids.json`, "utf8"));
  const opts = { agentOptions: { ...agentOptions, identity: ownerId } };
  return { acc: createActor(ids.accounting, opts), vault: createVault(ids.vault, opts) };
};
const fresh = (env: string) => {
  icp("canister", "install", "vault", "-e", env, "--mode", "reinstall", "-y");
  icp("canister", "install", "accounting", "-e", env, "--mode", "reinstall", "-y", "--args", `(opt principal "${ownerId.getPrincipal().toText()}")`);
  return pair(env);
};

const year = new Date().getUTCFullYear();
const pdf = new TextEncoder().encode("%PDF-1.4\n% Axelkod backup test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
let src: ReturnType<typeof pair>;
let dst: ReturnType<typeof pair>;
let zipBytes: Uint8Array;

test.beforeAll(async () => {
  src = fresh("backup");
  dst = fresh("restore");
});

test("passphrase container and tagged JSON", async () => {
  const v = { n: 12345678901234567890n, b: new Uint8Array([0, 1, 255]), u: undefined, a: [null, undefined, 1n], p: ownerId.getPrincipal() };
  const back = fromJson(toJson(v)) as typeof v;
  expect(back.n).toBe(v.n);
  expect(Array.from(back.b)).toEqual([0, 1, 255]);
  expect(back.u).toBeUndefined(); // the key is dropped, as for an absent Candid option
  expect(back.a).toEqual([null, undefined, 1n]);
  expect(back.p.toText()).toBe(v.p.toText());
  expect(strength("abc").score).toBe(0);
  expect(strength("Kort-men-lång-fras-2026!").score).toBeGreaterThanOrEqual(3);
  const sealed = await seal(new Uint8Array([1, 2, 3]), "rätt lösenfras", 1000);
  expect(Array.from(await unseal(sealed, "rätt lösenfras"))).toEqual([1, 2, 3]);
  await expect(unseal(sealed, "fel")).rejects.toThrow("passphrase");
});

test("backup of a filled canister", async () => {
  const { acc, vault } = src;
  ok(await acc.syncRolesToVault());
  ok(await acc.setCompany({
    legalName: "Säkerhetskopia AB", orgNr: "556036-0793", vatNr: "SE556036079301", registeredOffice: "Göteborg", street: "Gatan 1",
    postalCode: "411 01", city: "Göteborg", country: "SE", email: "a@example.se", fSkatt: true,
  }));
  const fy = ok(await acc.createFiscalYear(`${year}-01-01`, `${year}-12-31`, false));
  const att = await uploadDocument(acc, vault, new File([pdf], "kvitto åäö.pdf", { type: "application/pdf" }), Variant_scan_email_upload.upload);
  ok(await acc.postVoucher({
    series: "A", eventDate: `${year}-03-15`, description: "Kontorsmaterial \"special\"", attachmentIds: [att.id],
    lines: [{ account: 6110n, amount: 80_000n }, { account: 2641n, amount: 20_000n, vatCode: "I" }, { account: 1930n, amount: -100_000n }],
  }));
  const emp: EmployeeInput = {
    name: "Anna Andersson", birthYear: 1990n, employedFrom: `${year}-01-01`, pay: { __kind__: "monthly", monthly: 3_000_000n },
    tax: { __kind__: "flat", flat: 3000n }, vacationRule: "procentregeln" as EmployeeInput["vacationRule"], vacationDays: 25n,
    ownerOrRelated: false, active: true, personnummerEnc: await encryptPii(acc, "199001011234"), workplaceStreet: "Gatan 1", workplaceCity: "Göteborg",
  };
  ok(await acc.saveEmployee(null, emp));

  const b = await createBackup(acc, vault);
  expect(b.manifest.unreadable).toEqual([]);
  expect(b.manifest.unreadablePii).toBe(0);
  zipBytes = b.zip;
  const { files } = await readBackup(zipBytes);
  expect(Array.from(files.get(`files/${att.id}-kvitto_åäö.pdf`)!)).toEqual(Array.from(pdf));
  expect(new TextDecoder().decode(files.get("pii.json"))).toContain("199001011234");
  // SIE 4: parses back to the same voucher; the ledger balances; codepage 437.
  const sie = files.get(`sie/${year}-01-01_${year}-12-31.se`)!;
  expect(decode437(sie)).toContain('#FNAMN "Säkerhetskopia AB"');
  const f = parseSie(sie);
  expect(f.sieType).toBe("4");
  expect(f.vers).toHaveLength(1);
  expect(f.vers[0].text).toBe('Kontorsmaterial "special"');
  expect(f.vers[0].trans.reduce((s, t) => s + t.amount, 0n)).toBe(0n);
  expect(f.res.get(0)?.get(6110)).toBe(80_000n);
  expect(f.ub.get(0)?.get(1930)).toBe(-100_000n);
  expect((await allVouchers(acc, fy.id)).length).toBe(1);
  // The export is in the behandlingshistorik.
  const log = ok(await acc.auditLog(0n, 500n));
  expect(log.items[0]?.action).toBe("backup.export"); // newest first
});

test("restore into an empty canister", async () => {
  const { acc, vault } = dst;
  forgetKeys(); // another canister, other vetKeys
  const before = ok(await src.acc.backupSections());
  const { summary, skipped } = await restoreBackup(acc, vault, zipBytes);
  expect(skipped).toEqual([]);
  const count = (xs: typeof summary, s: string) => Number(xs.find((x) => x.store === s)?.count ?? -1n);
  // Same counts everywhere; for the audit log the source's backup.export is matched by the target's backup.restore.
  for (const s of before) expect(count(summary, s.store), s.store).toBe(Number(s.count));
  expect(ok(await acc.verifyAudit(0n))).toBeNull();
  expect(ok(await acc.auditLog(0n, 500n)).items[0]?.action).toBe("backup.restore");
  // Records are verbatim (attachments get this vault's file and key).
  for (const store of ["vouchers", "fiscalYears", "accounts", "employees", "natNats:files.voucherLinks", "textNat:ledger.numbering"]) {
    expect(toJson(ok(await acc.backupPage(store, 0n, 100n))), store).toBe(toJson(ok(await src.acc.backupPage(store, 0n, 100n))));
  }
  // Documents and personal data decrypt under the new keys.
  const [a] = ok(await acc.listAttachments(0n, 10n)).items;
  expect(Array.from(new Uint8Array(await (await openDocument(acc, vault, a)).arrayBuffer()))).toEqual(Array.from(pdf));
  const [e] = ok(await acc.listEmployees());
  expect(await decryptPii(acc, e.personnummerEnc)).toBe("199001011234");
  // The SIE 4 export of the restored canister equals the one in the backup.
  const { files } = await readBackup(zipBytes);
  const years = ok(await acc.listFiscalYears());
  const company = ok(await acc.getCompany())!;
  const accounts = ok(await acc.backupPage("accounts", 0n, 500n));
  const list = accounts.__kind__ === "accounts" ? accounts.accounts.map(([, x]) => x) : [];
  const again = await sieFile(acc, years, list, company, years[0]);
  const orig = files.get(`sie/${years[0].start}_${years[0].end}.se`)!;
  expect(decode437(again).replace(/#GEN \d+/, "")).toBe(decode437(orig).replace(/#GEN \d+/, ""));
  // A second restore is refused now that the canister holds data.
  await expect(restoreBackup(acc, vault, zipBytes)).rejects.toThrow("notEmpty");
});

// Full backup and restore (A9c, spec §10, BFNAR 2013:2 8.2 as amended by BFNAR 2024:1:
// backed up, and kept apart from the original). The backup is a ZIP with every store as
// JSON, the decrypted documents and personal data, SIE 4 per fiscal year and a manifest
// of SHA-256 hashes, encrypted as a whole with a passphrase (PBKDF2-SHA256 + AES-256-GCM).
import { Principal } from "@icp-sdk/core/principal";
import type { Account, Attachment, Chunk, CompanyProfile, FiscalYear, Singletons, Summary } from "../../bindings/accounting";
import { ok, type Accounting, type Vault } from "./api";
import { openDocument, purposeKey, reupload } from "./crypto";
import { allVouchers, fyMonths } from "./ledger";
import { decryptPii, encryptPii } from "./payroll";
import { encode437, sie4 } from "./sie4";
import { unzip, zip, type ZipEntry } from "./zip";

export const FORMAT = "axelkod-accounting-backup";
const MAGIC = "AXELKOD-BACKUP-1\n";
const ITERATIONS = 600_000;

// ── Tagged JSON: bigint, bytes, principals and absent options survive a round trip ──

export function toJson(v: unknown, space?: number): string {
  return JSON.stringify(v, function (this: Record<string, unknown>, k, x) {
    const raw = this[k];
    if (typeof raw === "bigint") return { $n: raw.toString() };
    if (raw instanceof Uint8Array) return { $b: b64(raw) };
    if (raw instanceof Principal) return { $p: raw.toText() };
    if (raw === undefined && k !== "") return { $u: 1 };
    return x;
  }, space);
}

export function fromJson(s: string): unknown {
  return JSON.parse(s, (_, x) => {
    if (x && typeof x === "object" && !Array.isArray(x)) {
      if (typeof x.$n === "string") return BigInt(x.$n);
      if (typeof x.$b === "string") return unb64(x.$b);
      if (typeof x.$p === "string") return Principal.fromText(x.$p);
      if (x.$u === 1) return undefined;
    }
    return x;
  });
}

const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>));

// ── Passphrase ──

/** 0 (weak) … 4 (strong), from the length and the kinds of characters used. */
export function strength(p: string): { score: 0 | 1 | 2 | 3 | 4; bits: number } {
  let pool = 0;
  if (/[a-zåäö]/.test(p)) pool += 29;
  if (/[A-ZÅÄÖ]/.test(p)) pool += 29;
  if (/\d/.test(p)) pool += 10;
  if (/[^a-zA-ZåäöÅÄÖ\d]/.test(p)) pool += 33;
  const unique = new Set(p).size;
  // Repeated characters add little: count each beyond the distinct ones as a quarter.
  const eff = Math.min(p.length, unique + (p.length - unique) / 4);
  const bits = Math.round(eff * Math.log2(Math.max(pool, 1)));
  const score = bits < 40 ? 0 : bits < 60 ? 1 : bits < 80 ? 2 : bits < 100 ? 3 : 4;
  return { score, bits };
}
/** The backup button needs at least 12 characters and "fair" strength. */
export const passOk = (p: string) => p.length >= 12 && strength(p).score >= 2;

async function deriveKey(pass: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as Uint8Array<ArrayBuffer>, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** MAGIC, a JSON header line (KDF and IV) and the AES-GCM ciphertext; the header is the AAD. */
export async function seal(plain: Uint8Array, pass: string, iterations = ITERATIONS): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const head = new TextEncoder().encode(`${MAGIC}${JSON.stringify({ kdf: "PBKDF2-SHA256", iterations, salt: b64(salt), cipher: "AES-256-GCM", iv: b64(iv) })}\n`);
  const key = await deriveKey(pass, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: head }, key, plain as Uint8Array<ArrayBuffer>));
  const out = new Uint8Array(head.length + ct.length);
  out.set(head);
  out.set(ct, head.length);
  return out;
}

export async function unseal(file: Uint8Array, pass: string): Promise<Uint8Array> {
  const magic = new TextEncoder().encode(MAGIC);
  if (magic.some((b, i) => file[i] !== b)) throw new Error("format");
  const nl = file.indexOf(10, magic.length);
  if (nl < 0) throw new Error("format");
  const head = file.subarray(0, nl + 1);
  const h = JSON.parse(new TextDecoder().decode(file.subarray(magic.length, nl))) as { kdf: string; iterations: number; salt: string; cipher: string; iv: string };
  if (h.kdf !== "PBKDF2-SHA256" || h.cipher !== "AES-256-GCM") throw new Error("format");
  const key = await deriveKey(pass, unb64(h.salt), h.iterations);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(h.iv), additionalData: head as Uint8Array<ArrayBuffer> }, key, file.subarray(nl + 1) as Uint8Array<ArrayBuffer>));
  } catch {
    throw new Error("passphrase");
  }
}

// ── Stores ──

type Store = { store: string; kind: string; key?: string };
const storeOf = (name: string): Store => {
  const [kind, key] = name.split(":");
  return key ? { store: name, kind, key } : { store: name, kind: name };
};
// Big records are fetched a few at a time to stay under the 2 MB query reply.
const PAGE: Record<string, bigint> = { taxTables: 1n, salesDocs: 25n, payRuns: 10n, agiReturns: 10n, vatReturns: 20n, purchases: 50n, salesDrafts: 25n, audit: 500n };

function payload(c: Chunk): unknown[] {
  const v = (c as Record<string, unknown>)[c.__kind__];
  return Array.isArray(v) ? v : (v as { entries: unknown[] }).entries;
}

function chunk(s: Store, items: unknown[]): Chunk {
  return (s.key ? { __kind__: s.kind, [s.kind]: { store: s.key, entries: items } } : { __kind__: s.kind, [s.kind]: items }) as unknown as Chunk;
}

/** Every value under a key ending in "Enc" (pii-v1 ciphertext). */
function ciphertexts(v: unknown, out: Map<string, Uint8Array>, key = "") {
  if (v instanceof Uint8Array) { if (key.endsWith("Enc")) out.set(hex(v), v); return; }
  if (Array.isArray(v)) { for (const x of v) ciphertexts(x, out, key); return; }
  if (v && typeof v === "object" && !(v instanceof Principal)) for (const [k, x] of Object.entries(v)) ciphertexts(x, out, k);
}

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120);
const filePath = (a: Attachment) => `files/${a.id}-${safeName(a.filename)}`;

export type Progress = (step: string, done: number, total: number) => void;

export type SieCompany = Pick<CompanyProfile, "legalName" | "orgNr" | "street" | "postalCode" | "city" | "phone">;

/** SIE 4E for one fiscal year (and the one before, when it exists), as CP437 bytes. */
export async function sieFile(acc: Accounting, years: FiscalYear[], accounts: Account[], company: SieCompany, y: FiscalYear, generated = new Date()): Promise<Uint8Array> {
  const prev = years.find((p) => new Date(Date.parse(`${p.end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) === y.start);
  const yearData = async (fy: FiscalYear) => ({
    year: fy, months: fyMonths(fy), balances: ok(await acc.balances(fy.id)),
    opening: new Map(ok(await acc.openingBalances(fy.id)).map((l) => [Number(l.account), l.amount])),
  });
  const [current, previous, vouchers] = await Promise.all([yearData(y), prev ? yearData(prev) : Promise.resolve(undefined), allVouchers(acc, y.id)]);
  return encode437(sie4({ program: { name: "Axelkod Ekonomi", version: "1" }, generated, company: { ...company, phone: company.phone ?? undefined }, accounts, current, previous, vouchers }));
}

export type Manifest = {
  format: typeof FORMAT;
  version: 1;
  createdAt: string;
  company: { legalName: string; orgNr: string } | null;
  stores: { store: string; count: number }[];
  entries: { name: string; size: number; sha256: string }[];
  /** Attachments whose file could not be read or decrypted; they are not in files/. */
  unreadable: { id: string; filename: string; error: string }[];
  /** Personal-data values that could not be decrypted (kept as ciphertext only). */
  unreadablePii: number;
};

/** Reads every store and file and returns the ZIP (not yet encrypted) and its manifest hash. */
export async function createBackup(acc: Accounting, vault: Vault, progress: Progress = () => {}): Promise<{ zip: Uint8Array; manifestSha256: Uint8Array; manifest: Manifest }> {
  const sections: Summary[] = ok(await acc.backupSections());
  const singletons: Singletons = ok(await acc.backupSingletons());
  const data = new Map<string, unknown[]>();
  for (const [i, sec] of sections.entries()) {
    progress("data", i, sections.length);
    const s = storeOf(sec.store);
    const items: unknown[] = [];
    const limit = PAGE[s.kind] ?? 200n;
    while (BigInt(items.length) < sec.count) {
      const got = payload(ok(await acc.backupPage(sec.store, BigInt(items.length), limit)));
      if (got.length === 0) break;
      items.push(...got);
    }
    data.set(sec.store, items);
  }
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [];
  entries.push({ name: "data/singletons.json", data: enc.encode(toJson(singletons, 1)) });
  for (const sec of sections) entries.push({ name: `data/${sec.store.replace(":", "/")}.json`, data: enc.encode(toJson(data.get(sec.store) ?? [], 1)) });

  // Personal data, decrypted (the whole backup is encrypted).
  const ct = new Map<string, Uint8Array>();
  for (const items of data.values()) ciphertexts(items, ct);
  const pii: { cipher: Uint8Array; plain: string | null }[] = [];
  let n = 0;
  for (const c of ct.values()) {
    progress("pii", n++, ct.size);
    pii.push({ cipher: c, plain: await decryptPii(acc, c).catch(() => null) });
  }
  entries.push({ name: "pii.json", data: enc.encode(toJson(pii, 1)) });

  const attachments = (data.get("attachments") ?? []) as Attachment[];
  const unreadable: Manifest["unreadable"] = [];
  for (const [i, a] of attachments.entries()) {
    progress("files", i, attachments.length);
    try {
      entries.push({ name: filePath(a), data: new Uint8Array(await (await openDocument(acc, vault, a)).arrayBuffer()) });
    } catch (e) {
      unreadable.push({ id: String(a.id), filename: a.filename, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const years = (data.get("fiscalYears") ?? []).map((e) => (e as [bigint, FiscalYear])[1]);
  const accounts = (data.get("accounts") ?? []).map((e) => (e as [bigint, Account])[1]);
  if (singletons.company) {
    for (const [i, y] of years.entries()) {
      progress("sie", i, years.length);
      entries.push({ name: `sie/${y.start}_${y.end}.se`, data: await sieFile(acc, years, accounts, singletons.company, y) });
    }
  }
  entries.push({ name: "LASMIG.txt", data: enc.encode(README) });

  const manifest: Manifest = {
    format: FORMAT, version: 1, createdAt: new Date().toISOString(),
    company: singletons.company ? { legalName: singletons.company.legalName, orgNr: singletons.company.orgNr } : null,
    stores: sections.map((s) => ({ store: s.store, count: Number(s.count) })),
    entries: await Promise.all(entries.map(async (e) => ({ name: e.name, size: e.data.length, sha256: hex(await sha256(e.data)) }))),
    unreadable,
    unreadablePii: pii.filter((p) => p.plain === null).length,
  };
  const m = enc.encode(JSON.stringify(manifest, null, 1));
  const manifestSha256 = await sha256(m);
  ok(await acc.backupTaken(manifestSha256));
  return { zip: zip([{ name: "manifest.json", data: m }, ...entries]), manifestSha256, manifest };
}

const README = `Axelkod Ekonomi – säkerhetskopia

manifest.json   innehåll och SHA-256 för varje fil
data/           alla register som JSON (taggade värden: {"$n"} heltal, {"$b"} bytes i base64, {"$p"} principal, {"$u"} saknas)
pii.json        personuppgifter i klartext (personnummer, adresser, bankkonton), med den krypterade formen de har i registren
files/          mottagna verifikationer och underlag, dekrypterade
sie/            SIE 4 per räkenskapsår (SIE 4C, teckentabell 437)

Återställs under Inställningar › Säkerhetskopia i en ny, tom installation.
`;

/** Checks the ZIP against its manifest; returns the entries by name and the manifest. */
export async function readBackup(zipBytes: Uint8Array): Promise<{ manifest: Manifest; files: Map<string, Uint8Array>; manifestSha256: Uint8Array }> {
  const files = new Map(unzip(zipBytes).map((e) => [e.name, e.data]));
  const m = files.get("manifest.json");
  if (!m) throw new Error("manifest");
  const manifest = JSON.parse(new TextDecoder().decode(m)) as Manifest;
  if (manifest.format !== FORMAT || manifest.version !== 1) throw new Error("format");
  for (const e of manifest.entries) {
    const d = files.get(e.name);
    if (!d || d.length !== e.size || hex(await sha256(d)) !== e.sha256) throw new Error(`hash: ${e.name}`);
  }
  return { manifest, files, manifestSha256: await sha256(m) };
}

// Restore calls carry at most 256 KiB (main.mo inspect); tagged JSON is larger than Candid.
const MAX_JSON = 150_000;

function batches(items: unknown[]): unknown[][] {
  const out: unknown[][] = [];
  let cur: unknown[] = [];
  let size = 0;
  for (const x of items) {
    const n = toJson(x).length;
    if (cur.length && (size + n > MAX_JSON || cur.length >= 400)) { out.push(cur); cur = []; size = 0; }
    cur.push(x);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Restores a checked backup into this (empty) canister. The caller must be its owner.
 *  Attachments the backup could not read are left out and returned in `skipped`. */
export async function restoreBackup(acc: Accounting, vault: Vault, zipBytes: Uint8Array, progress: Progress = () => {}): Promise<{ summary: Summary[]; skipped: Manifest["unreadable"] }> {
  const { manifest, files, manifestSha256 } = await readBackup(zipBytes);
  const dec = new TextDecoder();
  const json = (name: string) => fromJson(dec.decode(files.get(name) ?? new Uint8Array())) as unknown;
  const state = ok(await acc.restoreState());
  if (!state.empty && !state.restoring) throw new Error("notEmpty");
  // While restoring, roles are empty: the keys and the vault role are taken first.
  ok(await acc.syncRolesToVault());
  await Promise.all([purposeKey(acc, "docs-v1"), purposeKey(acc, "pii-v1")]);
  const pii = json("pii.json") as { cipher: Uint8Array; plain: string | null }[];
  const pairs: [Uint8Array, Uint8Array][] = [];
  for (const [i, p] of pii.entries()) {
    progress("pii", i, pii.length);
    if (p.plain !== null) pairs.push([p.cipher, await encryptPii(acc, p.plain)]);
  }

  ok(await acc.restoreBegin(json("data/singletons.json") as Singletons));
  let attachments: Attachment[] = [];
  for (const [i, sec] of manifest.stores.entries()) {
    progress("data", i, manifest.stores.length);
    const items = json(`data/${sec.store.replace(":", "/")}.json`) as unknown[];
    if (sec.store === "attachments") { attachments = items as Attachment[]; continue; }
    for (const b of batches(items)) ok(await acc.restorePut(chunk(storeOf(sec.store), b)));
  }
  const skipped = new Set(manifest.unreadable.map((u) => u.id));
  for (const [i, a] of attachments.entries()) {
    progress("files", i, attachments.length);
    if (skipped.has(String(a.id))) continue;
    const plain = files.get(filePath(a));
    if (!plain) throw new Error(`file: ${a.id}`);
    const { vaultFileId, wrappedKey } = await reupload(acc, vault, plain, a.mime, Uint8Array.from(a.plainSha256));
    ok(await acc.restoreAttachment(a, vaultFileId, wrappedKey));
  }
  for (let i = 0; i < pairs.length; i += 200) ok(await acc.restoreRekey(pairs.slice(i, i + 200)));
  const summary = ok(await acc.restoreCommit(manifestSha256));
  ok(await acc.syncRolesToVault());
  return { summary, skipped: manifest.unreadable };
}

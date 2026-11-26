// Envelope encryption for received documents (C16). One vetKey per purpose is
// derived once per session; each file gets a random AES-256-GCM key, which is
// wrapped by the vetKey and stored on the attachment. The vault only sees ciphertext.
import { DerivedPublicKey, EncryptedVetKey, TransportSecretKey, type DerivedKeyMaterial } from "@icp-sdk/vetkeys";
import type { Attachment, Variant_scan_email_upload } from "../../bindings/accounting";
import { ok, type Accounting, type Vault } from "./api";
import { keys } from "./keycache";

export const CHUNK = 1_900_000; // vault/src/lib/Store.mo CHUNK
export const MAX_FILE = 20_000_000; // accounting MAX_SIZE (plaintext)
export const MIME = ["application/pdf", "image/jpeg", "image/png", "image/heic", "application/xml", "text/xml"];

const DOMAIN = "axelkod-accounting-dek";
const GCM_OVERHEAD = 28; // 12-byte IV + 16-byte tag

/** The vetKey for `purpose` (docs-v1, pii-v1), verified against the canister's public key. */
export function purposeKey(acc: Accounting, purpose: string): Promise<DerivedKeyMaterial> {
  let p = keys.get(purpose);
  if (!p) {
    p = (async () => {
      const tsk = TransportSecretKey.random();
      const [pk, enc] = await Promise.all([acc.vetkdPublicKey(), acc.deriveKey(purpose, tsk.publicKeyBytes())]);
      const dpk = DerivedPublicKey.deserialize(Uint8Array.from(ok(pk)));
      const key = EncryptedVetKey.deserialize(Uint8Array.from(ok(enc))).decryptAndVerify(tsk, dpk, new TextEncoder().encode(purpose));
      return key.asDerivedKeyMaterial();
    })();
    p.catch(() => keys.delete(purpose)); // a failed derive may be retried
    keys.set(purpose, p);
  }
  return p;
}

const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>));

async function encryptFile(plain: Uint8Array): Promise<{ dek: Uint8Array; cipher: Uint8Array }> {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey("raw", dek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, plain as Uint8Array<ArrayBuffer>));
  const cipher = new Uint8Array(iv.length + ct.length);
  cipher.set(iv);
  cipher.set(ct, iv.length);
  return { dek, cipher };
}

export type Progress = (sent: number, total: number) => void;

/** Hash → encrypt → ticket → chunks → finalize → confirm. Returns the confirmed attachment. */
export async function uploadDocument(
  acc: Accounting, vault: Vault, file: File, via: Variant_scan_email_upload, onProgress?: Progress,
): Promise<Attachment> {
  if (!MIME.includes(file.type)) throw new Error("mime");
  if (file.size === 0 || file.size > MAX_FILE) throw new Error("size");
  const plain = new Uint8Array(await file.arrayBuffer());
  const plainSha256 = await sha256(plain);
  const key = await purposeKey(acc, "docs-v1");
  const { dek, cipher } = await encryptFile(plain);
  // The wrapped key is bound to the file's hash, so it cannot be moved to another file.
  const wrappedKey = await key.encryptMessage(dek, DOMAIN, plainSha256);
  const ticket = ok(await acc.beginAttachment({
    filename: file.name.slice(0, 200) || "dokument", mime: file.type, size: BigInt(file.size),
    plainSha256, wrappedKey, keyId: "docs-v1", receivedVia: via,
  }));
  const chunks = Math.ceil(cipher.length / CHUNK);
  const upload = ok(await vault.beginUpload({ mime: file.type, size: BigInt(cipher.length), chunkCount: BigInt(chunks), cipherSha256: await sha256(cipher) }));
  for (let i = 0; i < chunks; i++) {
    ok(await vault.putChunk(upload, BigInt(i), cipher.subarray(i * CHUNK, (i + 1) * CHUNK)));
    onProgress?.(i + 1, chunks);
  }
  const info = ok(await vault.finalize(upload));
  return ok(await acc.confirmAttachment(ticket, info.id));
}

/** Restore (A9c): a backed-up file encrypted and uploaded again under this canister's docs-v1 key. */
export async function reupload(acc: Accounting, vault: Vault, plain: Uint8Array, mime: string, plainSha256: Uint8Array): Promise<{ vaultFileId: bigint; wrappedKey: Uint8Array }> {
  const got = await sha256(plain);
  if (got.some((b, i) => b !== plainSha256[i])) throw new Error("hash");
  const key = await purposeKey(acc, "docs-v1");
  const { dek, cipher } = await encryptFile(plain);
  const wrappedKey = await key.encryptMessage(dek, DOMAIN, plainSha256);
  const chunks = Math.ceil(cipher.length / CHUNK);
  const upload = ok(await vault.beginUpload({ mime, size: BigInt(cipher.length), chunkCount: BigInt(chunks), cipherSha256: await sha256(cipher) }));
  for (let i = 0; i < chunks; i++) ok(await vault.putChunk(upload, BigInt(i), cipher.subarray(i * CHUNK, (i + 1) * CHUNK)));
  return { vaultFileId: ok(await vault.finalize(upload)).id, wrappedKey };
}

/** Fetches, decrypts and checks a stored document against its plaintext hash. */
export async function openDocument(acc: Accounting, vault: Vault, a: Attachment): Promise<Blob> {
  const key = await purposeKey(acc, a.keyId);
  const dek = await key.decryptMessage(Uint8Array.from(a.wrappedKey), DOMAIN, Uint8Array.from(a.plainSha256));
  const size = Number(a.size) + GCM_OVERHEAD;
  const cipher = new Uint8Array(size);
  for (let i = 0; i * CHUNK < size; i++) cipher.set(Uint8Array.from(ok(await vault.getChunk(a.vaultFileId, BigInt(i)))), i * CHUNK);
  const k = await crypto.subtle.importKey("raw", dek as Uint8Array<ArrayBuffer>, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: cipher.subarray(0, 12) }, k, cipher.subarray(12)));
  const got = await sha256(plain);
  if (got.some((b, i) => b !== a.plainSha256[i])) throw new Error("hash");
  return new Blob([plain], { type: a.mime });
}

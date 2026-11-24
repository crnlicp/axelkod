// Publish SEO: regenerate the public pages' SEO tags, sitemap.xml and robots.txt in
// the browser with the same renderer as the deploy-time bake, and write them in one
// atomic upload_assets call as the (authorized) admin.
import type { Identity } from "@icp-sdk/core/agent";
import type { Backend } from "../bindings/backend";
import { PAGE_TEXTS, toSeoData } from "../lib/seo";
import { PAGE_FILES, replaceSeoRegion, robotsTxt, sitemapXml } from "../lib/seo-head";
import { assetsActor, MAX_UPLOAD_BYTES, type UploadAsset } from "./assets";

// _headers does not apply to uploaded files, so the live security headers are
// copied over. The CSP hashes stay valid: Publish never touches executable scripts.
const COPIED_HEADERS = [
  "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy",
  "permissions-policy", "strict-transport-security", "cross-origin-opener-policy", "cache-control",
];
const enc = new TextEncoder();

export async function publishSeo(backend: Backend, identity: Identity): Promise<bigint> {
  const cfg = await backend.getPublicConfig();
  const data = toSeoData(cfg.seo, cfg.contact);
  const uploads: UploadAsset[] = [];

  for (const f of PAGE_FILES) {
    const res = await fetch(f.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${f.url}: HTTP ${res.status}`);
    const html = replaceSeoRegion(await res.text(), data, f.page, f.lang, PAGE_TEXTS);
    const headers = COPIED_HEADERS.flatMap((h) => {
      const v = res.headers.get(h);
      return v ? [[h, v] as [string, string]] : [];
    });
    if (!headers.some(([h]) => h === "content-security-policy")) throw new Error(`${f.url}: no CSP header to keep`);
    uploads.push({ key: f.key, content_type: "text/html", headers, content: enc.encode(html) });
  }
  const short: Array<[string, string]> = [["cache-control", "public, max-age=3600"], ["x-content-type-options", "nosniff"]];
  uploads.push(
    { key: "/sitemap.xml", content_type: "application/xml", headers: short, content: enc.encode(sitemapXml(data, new Date().toISOString().slice(0, 10))) },
    { key: "/robots.txt", content_type: "text/plain", headers: short, content: enc.encode(robotsTxt(data)) },
  );

  const total = uploads.reduce((n, u) => n + u.content.length, 0);
  if (total > MAX_UPLOAD_BYTES) throw new Error(`Publish payload too large (${total} bytes)`);

  const assets = await assetsActor(identity);
  await assets.upload_assets(uploads);
  const marked = await backend.markSeoPublished();
  if (marked.__kind__ === "err") throw new Error(marked.err.__kind__);
  return marked.ok;
}

const OG_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Uploads an OG image to /uploads/ (kept across deploys by _preserve); returns its path. */
export async function uploadOgImage(identity: Identity, file: File): Promise<string> {
  const ext = OG_TYPES[file.type];
  if (!ext) throw new Error("Endast PNG, JPEG eller WebP.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Bilden är större än 1,9 MB.");
  const key = `/uploads/og-${Date.now()}.${ext}`;
  const assets = await assetsActor(identity);
  await assets.upload_asset({
    key,
    content_type: file.type,
    headers: [["cache-control", "public, max-age=31536000, immutable"], ["x-content-type-options", "nosniff"]],
    content: new Uint8Array(await file.arrayBuffer()),
  });
  return key;
}

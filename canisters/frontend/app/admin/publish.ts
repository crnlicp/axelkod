// Publish: regenerate the baked parts of the site (SEO tags, news cards and lists,
// one page per article, sitemap.xml, robots.txt) in the browser with the same code
// as the deploy-time bake (lib/site-bake.ts) and write them with upload_assets as
// the (authorized) admin.
import type { Identity } from "@icp-sdk/core/agent";
import type { Backend } from "../bindings/backend";
import { fromBackend, goneHtml, replaceRegion, TEMPLATE } from "../lib/news-render";
import { replaceSeoRegion } from "../lib/seo-head";
import { PAGE_TEXTS, toSeoData } from "../lib/seo";
import { bakeSite, SITE_PAGES } from "../lib/site-bake";
import { assetsActor, listAssetKeys, MAX_UPLOAD_BYTES, type UploadAsset } from "./assets";

// _headers does not apply to uploaded files, so the live security headers are
// copied over. The CSP hashes stay valid: Publish never touches executable scripts,
// and articles are copies of the template whose headers they take.
const COPIED_HEADERS = [
  "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy",
  "permissions-policy", "strict-transport-security", "cross-origin-opener-policy", "cache-control",
];
const enc = new TextEncoder();
const CHUNK = 1_700_000;

async function fetchPage(url: string, okStatus = true) {
  const res = await fetch(url, { cache: "no-store" });
  if (okStatus && !res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const headers = COPIED_HEADERS.flatMap((h) => {
    const v = res.headers.get(h);
    return v ? [[h, v] as [string, string]] : [];
  });
  if (!headers.some(([h]) => h === "content-security-policy")) throw new Error(`${url}: no CSP header to keep`);
  return { html: await res.text(), headers };
}

export async function publishSeo(backend: Backend, identity: Identity): Promise<bigint> {
  const [cfg, news] = await Promise.all([backend.getPublicConfig(), backend.publishedNews()]);
  const live = await Promise.all(SITE_PAGES.map(async (p) => [p.key, await fetchPage(p.url)] as const));
  const tplSv = await fetchPage(TEMPLATE.sv.url);
  const tplEn = await fetchPage(TEMPLATE.en.url);
  const result = bakeSite({
    data: toSeoData(cfg.seo, cfg.contact),
    news: news.map(fromBackend),
    texts: PAGE_TEXTS,
    today: new Date().toISOString().slice(0, 10),
    pages: Object.fromEntries(live.map(([k, v]) => [k, v.html])),
    templates: { sv: tplSv.html, en: tplEn.html },
  });
  const headersOf = Object.fromEntries(live.map(([k, v]) => [k, v.headers]));
  // Runtime uploads get no clean-URL alias (only a deploy sync creates those), so
  // new articles are written at their public URL ("/nyheter/<slug>") rather than
  // as "<slug>.html". The next deploy replaces them with aliased .html files.
  const keyOf = (f: { key: string; article: boolean }) => (f.article ? f.key.replace(/\.html$/, "") : f.key);
  const uploads: UploadAsset[] = result.files.map((f) => ({
    key: keyOf(f),
    content_type: "text/html",
    headers: f.article ? (f.key.startsWith("/en/") ? tplEn.headers : tplSv.headers) : headersOf[f.key],
    content: enc.encode(f.html),
  }));
  const short: Array<[string, string]> = [["cache-control", "public, max-age=3600"], ["x-content-type-options", "nosniff"]];
  uploads.push(
    { key: "/sitemap.xml", content_type: "application/xml", headers: short, content: enc.encode(result.sitemap) },
    { key: "/robots.txt", content_type: "text/plain", headers: short, content: enc.encode(result.robots) },
  );

  const assets = await assetsActor(identity);
  // Articles that were removed or unpublished: overwrite with the 404 page (noindex)
  // until the next deploy, which drops them for real (deploys bake live articles only).
  const current = new Set(result.files.filter((f) => f.article).flatMap((f) => [f.key, keyOf(f)]));
  const stale = (await listAssetKeys(assets)).filter((k) => /^\/(nyheter|en\/news)\/[^/]+$/.test(k) && !current.has(k));
  // Built from the article template (so the client's article route hydrates it),
  // with noindex SEO (no doc) and a "not found" body.
  for (const key of stale) {
    const lang = key.startsWith("/en/") ? "en" : "sv";
    const tpl = lang === "en" ? tplEn : tplSv;
    const data = toSeoData(cfg.seo, cfg.contact);
    const html = replaceRegion(replaceSeoRegion(tpl.html, data, "article", lang, PAGE_TEXTS), "article", goneHtml(lang));
    uploads.push({ key, content_type: "text/html", headers: [...tpl.headers, ["x-robots-tag", "noindex, nofollow"]], content: enc.encode(html) });
  }

  // One upload_assets call per ~1.7 MB (an ingress message is ~2 MB).
  let batch: UploadAsset[] = [];
  let size = 0;
  for (const u of uploads) {
    if (u.content.length > MAX_UPLOAD_BYTES) throw new Error(`${u.key} is too large (${u.content.length} bytes)`);
    if (size + u.content.length > CHUNK && batch.length) {
      await assets.upload_assets(batch);
      batch = [];
      size = 0;
    }
    batch.push(u);
    size += u.content.length;
  }
  if (batch.length) await assets.upload_assets(batch);

  const marked = await backend.markSeoPublished();
  if (marked.__kind__ === "err") throw new Error(marked.err.__kind__);
  return marked.ok;
}

const OG_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Uploads an image to /uploads/ (kept across deploys by _preserve); returns its path. */
export async function uploadImage(identity: Identity, file: File, prefix: "og" | "news"): Promise<string> {
  const ext = OG_TYPES[file.type];
  if (!ext) throw new Error("Endast PNG, JPEG eller WebP.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Bilden är större än 1,9 MB.");
  const key = `/uploads/${prefix}-${Date.now()}.${ext}`;
  const assets = await assetsActor(identity);
  await assets.upload_asset({
    key,
    content_type: file.type,
    headers: [["cache-control", "public, max-age=31536000, immutable"], ["x-content-type-options", "nosniff"]],
    content: new Uint8Array(await file.arrayBuffer()),
  });
  return key;
}

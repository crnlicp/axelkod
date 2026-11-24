// Runs at `icp deploy` sync time, after the canisters exist, with ICP_CLI_NETWORK
// and ICP_CLI_CID_<NAME> in the environment.
//
// 1. SEO bake: reads the SEO settings and contact info from the backend (the single
//    source of truth) and writes them into the prerendered pages, sitemap.xml and
//    robots.txt with the same renderer the admin's Publish uses, so a deploy
//    reproduces the last Publish.
// 2. Local networks: the agent talks to the gateway at http://localhost:<port>, so
//    the CSP's connect-src gets that origin. Mainnet keeps the production policy.
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { idlFactory } from "../app/bindings/declarations/backend.did.js";
import { PAGE_FILES, replaceSeoRegion, robotsTxt, sitemapXml } from "../app/lib/seo-head.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../build/client");
const network = process.env.ICP_CLI_NETWORK ?? "";
const backendId = process.env.ICP_CLI_CID_BACKEND;

async function agent() {
  if (network === "ic") return HttpAgent.create({ host: "https://icp-api.io" });
  const status = JSON.parse(execFileSync("icp", ["network", "status", "--json"], { encoding: "utf8" }));
  return HttpAgent.create({ host: status.api_url, rootKey: Uint8Array.from(Buffer.from(status.root_key, "hex")) });
}

// Candid opt values arrive as [] | [x] here (raw declarations, not the wrapper).
const opt = (o) => (o.length ? o[0] : undefined);
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
const lang = (l) =>
  clean({
    title: l.title, metaDescription: l.metaDescription, keywords: opt(l.keywords), ogTitle: opt(l.ogTitle),
    ogDescription: opt(l.ogDescription), ogImageUrl: l.ogImageUrl, canonicalBaseUrl: l.canonicalBaseUrl, indexable: l.indexable,
  });

function texts() {
  const read = (l) => JSON.parse(readFileSync(resolve(here, `../app/i18n/${l}.json`), "utf8"));
  const t = (j) => ({ privacyTitle: j.seo.privacyTitle, privacyDescription: j.seo.privacyDescription, locale: j.locale });
  return { sv: t(read("sv")), en: t(read("en")) };
}

async function bakeSeo() {
  if (!backendId) throw new Error("presync: ICP_CLI_CID_BACKEND not set");
  const backend = Actor.createActor(idlFactory, { agent: await agent(), canisterId: backendId });
  const cfg = await backend.getPublicConfig();
  const c = cfg.contact;
  const data = clean({
    sv: lang(cfg.seo.sv),
    en: lang(cfg.seo.en),
    organisationName: cfg.seo.organisationName,
    logoUrl: cfg.seo.logoUrl,
    sameAs: cfg.seo.sameAs,
    googleVerification: opt(cfg.seo.googleVerification),
    bingVerification: opt(cfg.seo.bingVerification),
    contact: clean({ email: opt(c.email), phone: opt(c.phone), street: opt(c.street), postalCode: opt(c.postalCode), city: c.city }),
  });
  const t = texts();
  for (const f of PAGE_FILES) {
    const file = join(out, f.key);
    writeFileSync(file, replaceSeoRegion(readFileSync(file, "utf8"), data, f.page, f.lang, t));
  }
  writeFileSync(join(out, "sitemap.xml"), sitemapXml(data, new Date().toISOString().slice(0, 10)));
  writeFileSync(join(out, "robots.txt"), robotsTxt(data));
  console.log(`presync: SEO baked from backend ${backendId} into ${PAGE_FILES.length} pages`);
}

function localCsp() {
  const headersFile = join(out, "_headers");
  const PROD = "connect-src 'self' https://icp-api.io";
  const headers = readFileSync(headersFile, "utf8");
  if (!headers.includes(PROD)) throw new Error(`presync: "${PROD}" not found in _headers`);
  if (network !== "ic" && !headers.includes(`${PROD} http://localhost:*`)) {
    writeFileSync(headersFile, headers.replaceAll(PROD, `${PROD} http://localhost:*`));
    console.log(`presync: network "${network}", CSP allows http://localhost:*`);
  }
}

await bakeSeo();
localCsp();

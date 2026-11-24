# Build and deploy the Axelkod AB website on the Internet Computer (ICP)

## Role
You are a senior full-stack engineer and UI designer experienced with the Internet Computer (ICP), `icp-cli`, Motoko canisters (`mo:core`, mops), Internet Identity, the certified-assets canister (`@dfinity/static-site` recipe) and modern React. Build a production-ready website for **Axelkod AB**. Plan before you code, work in small verified steps, and explain any decision that affects security, cycle cost or maintainability.

**Source of truth:** `~/.claude/icp/RULES.md` (folder layout, tooling, identities, Motoko conventions) and the current ICP skills it points to. If this spec and RULES.md disagree, RULES.md wins. Load the matching skill before writing IC code or config.

## About the company (keep it short on the site)
- Axelkod AB is a Swedish company in Mölndal (Gothenburg region) with three areas:
  1. **Vehicle parts:** spare parts and accessories for trucks and heavy vehicles
  2. **Software development:** software, web applications and websites
  3. **Cyber security:** IT and information security consulting
- **Reveal little on purpose.** Each area gets one short, confident sentence: no service lists, prices, partners or brand names. The site's main goal is to make visitors **use the contact form** to learn more.
- Tone: professional, modern, trustworthy, Scandinavian, minimal.

## Brand
- Logo: `axelkod-logo.svg` (provided in `docs/brand/`). Symbol: shield, `</>`, circuit traces, hexagon chain, gear.
- Colours: Navy `#032843`, Teal `#05A390`, white, neutral greys. **Dark theme by default** (deep navy with teal/cyan glow, redesign 2026-11-24), light theme via a toggle.
- Typography: self-hosted fonts only (no Google Fonts calls, for GDPR), e.g. Barlow Condensed for headings and Inter for body.
- Visual style (redesign 2026-11-24): modern and animated: glass panels, teal/cyan glow, slow aurora gradients, gradient headline text, cursor spotlight on cards, an animated hexagon/circuit network in the hero (canvas, paused off-screen). Animations use the **Motion** library (`motion/mini` for scroll reveals; Motion React only in lazily loaded parts) and CSS; start states live in CSS classes so the CSP stays strict; everything is still under `prefers-reduced-motion`.

## Languages
- **Swedish (default) and English**, with routes `/` (sv) and `/en/`, a language switch, and `hreflang` links.
- All static UI text lives in `canisters/frontend/app/i18n/sv.json` and `canisters/frontend/app/i18n/en.json`.
- Clean URLs come from the certified-assets canister: `index.html` → `/`, `en/index.html` → `/en/`, `integritet.html` → `/integritet`, `en/privacy.html` → `/en/privacy`.

## Public site (single page with anchors, plus a few routes)
1. **Header:** sticky glass bar (logo, section links with active indicator, theme toggle, language switch); animated menu on small screens.
2. **Hero:** eyebrow, headline "Delar. Kod. Säkerhet." / "Parts. Code. Security." (CSS entrance, LCP-safe), subline "Reservdelar, mjukvara och cybersäkerhet, levererat med svensk noggrannhet.", buttons "Kontakta oss" and "Se vad vi gör", the logo inside rotating hexagon rings, animated circuit network background.
3. **Trust strip:** personal contact, Swedish company, secure by design, quick response (one line each).
4. **What we do:** bento grid of Vehicle parts / Software / Cyber security with animated visuals (turning gear, typing code window, scanning shield), one sentence each.
5. **Security by design:** four nested layers around the logo (code, infrastructure, people, supply chain), chosen by hover/focus/click, one sentence per layer.
6. **Who we help:** haulage & logistics, workshops, small and medium businesses, industry & manufacturing (tiles, one line each).
7. **News:** the 3 latest published articles as cards (cover or generated artwork, date, area, title, excerpt) and a link to all news.
8. **Contact:** form in a glass panel plus contact details loaded from the backend (editable in admin).
9. **Footer:** company name, org. nr, city, email, phone (each shown only if set in admin), section links, privacy notice, language switch, © year.
10. **News pages:** `/nyheter`, `/en/news` (all published articles) and one page per article, `/nyheter/<slug>` and `/en/news/<slug>` (English only when the article has an English version).
11. **Privacy notice** (`/integritet`, `/en/privacy`): what the form collects, purpose, retention period, deletion requests, contact. The retention period text comes from the admin setting.
12. **404 page** in the same style.

## News
- Article: slug (unique), draft/published, publish date (future dates stay hidden until then), optional area (vehicle parts, software, cyber security, company), optional cover image (`/uploads/…` or https) with alt text, Swedish title/excerpt/body (required) and English (optional).
- Body: a safe Markdown subset (paragraphs, `##`/`###` headings, lists, quotes, bold, italic, code, links to https or same-site paths). Raw HTML is never rendered.
- Backend: `listNews(lang, offset, limit)`, `getNews(slug, lang)`, `publishedNews()` (public, published only); `adminListNews`, `createNews`, `updateNews`, `deleteNews` (admins). Max 500 articles.
- Landing cards, list pages and article pages are baked into the static HTML at every deploy (`presync`) and by Publish, from prerendered article templates, with per-article SEO (NewsArticle JSON-LD, canonical, hreflang only where a translation exists) and sitemap entries. A removed article shows a noindex "not found" page after Publish and is deleted at the next deploy.

## Contact form (simple)
- Fields: name*, email*, phone (optional), company (optional), area of interest (select: Vehicle parts / Software / Cyber security / Other)*, message* (max 2,000 characters), GDPR consent checkbox* linking to the privacy notice.
- Validation on the client **and** in the canister (lengths, email format, required fields, allowed enum values, stripping control characters).
- Spam protection with no third-party services: hidden honeypot field, minimum time to submit (at least 3 s, token issued on page load), rate limiting in the canister (global and per-session token), request-size caps.
  - Form token: `getFormToken()` (query) returns a timestamp signed with a random secret the canister creates at init (`raw_rand`). `submitContact` rejects tokens younger than 3 s, older than a set lifetime, or already used.
- Success message: "Tack! Vi återkommer inom 1–2 arbetsdagar." / "Thank you! We'll get back to you within 1–2 business days."
- **No email sending**: messages are only stored and read in the admin inbox.

## Backend canister (Motoko)
Follow RULES.md "Motoko backend" and "Motoko conventions": `mo:core` only, `mops check` before building, a persistent actor whose state (e.g. `mo:core` `Map`) survives upgrades, and explicit upgrade-safe types. `src/main.mo` owns the state and includes mixins (no public methods of its own). Types go in `types.mo`, stateless logic in `lib/`, the public API in `mixins/`. State changes that aren't stable-compatible go in the single pending migration in `src/migrations/`. Commit the curated `src/backend.did`.

**Data:**
- `Message`: id, createdAt, name, email, phone?, company?, area, message, lang, status (`#new | #read | #handled`), adminNote?
- `ContactInfo`: email, phone?, street?, postalCode?, city, orgNumber?, showAddress (bool), showPhone (bool)
- `SeoSettings` per language (`sv`, `en`): title, metaDescription, keywords?, ogTitle?, ogDescription?, ogImageUrl, canonicalBaseUrl (default `https://axelkod.eu`), indexable (bool); global: organisation name, logo URL, sameAs links (LinkedIn etc.), Google/Bing site-verification tokens (optional)
- `SiteSettings`: retentionMonths (default 12), responseTimeText per language

**Public methods:**
- `getFormToken() : query`
- `submitContact(input, formToken) : async Result<Nat, Text>`
- `getPublicConfig() : query`, returning ContactInfo (respecting show flags), SEO for runtime use and responseTime text

**Admin methods** (caller must be an allowlisted Internet Identity principal):
- Messages: `listMessages(filter, page)`, `setStatus(id, status)`, `setNote(id, text)`, `deleteMessage(id)`, `exportMessagesCsv()`
- Settings: `get/setContactInfo`, `get/setSeoSettings`, `get/setSiteSettings`
- Admins: `addAdmin(principal)`, `removeAdmin(principal)`, `listAdmins()`; the first admin is set by an init argument at deploy and you can't remove the last admin. Adding or removing an admin must also `authorize`/`deauthorize` that principal on the frontend canister (needed for Publish). Only controllers may call those, so the **backend canister is a controller of the frontend canister** (decided 2026-11-24; added by the deploy script, mainnet with approval). Trade-off: a compromised backend could upgrade or delete the frontend. Controllers (the deploy identity) may also add/remove admins to bootstrap or recover access, but are never admins themselves. `syncAdminsToFrontend()` re-applies the admin set after a frontend reinstall. Never make admins controllers.
- Retention: a recurring timer deletes messages older than `retentionMonths`.

## Admin panel (`/admin`, `noindex`, excluded from the sitemap)
- Login with **Internet Identity**; non-admins see "Access denied".
- II principals depend on the origin. Per the `user-sign-in` skill the primary origin is the **frontend canister address** (`https://<frontend-id>.icp.net`), not the domain (a domain can lapse; a canister ID can't). The canister serves `/.well-known/ii-alternative-origins` listing `https://axelkod.eu` and `https://www.axelkod.eu`, and on the custom domain the client passes `derivationOrigin: https://<frontend-id>.icp.net`, so an admin keeps one principal on both.
- **Inbox:** list with new/read/handled filters, search, detail view, internal note, mark status, delete, CSV export, unread counter.
- **Contact info:** edit all ContactInfo fields with a live preview.
- **SEO** (per language tab): title (with a character counter, ~60), meta description (~155), OG title/description, OG image upload (written to the frontend canister under `/uploads/*` with `upload_asset`, ≤ 2 MB, kept across deploys by `_preserve`), canonical URL, index/noindex toggle, organisation JSON-LD fields, verification tokens, and a Google search-result preview.
- **Publish SEO:** crawlers need the meta tags in the HTML. The certified-assets canister has no `AssetManager` or `grant_permission` (those are legacy asset-canister APIs). Instead:
  - The backend canister is the single source of truth for SEO.
  - At deploy, the frontend `presync` step reads the SEO settings from the backend and bakes them into the prerendered HTML.
  - The admin's **"Publish"** button regenerates the same files in the browser, using the same head renderer as the build. It writes them live in one atomic `upload_assets` call, made by the admin's `authorize`d principal.
  - A later deploy reproduces the same output, so deploys and Publish never drift.
  - Trade-off: an `authorize`d admin can overwrite any frontend file.
  
  Files written:
  - `index.html` for `/` and `/en/`, plus the privacy pages (their canonical/hreflang/robots follow the same settings), with the `<head>` filled in (title, description, canonical, hreflang, OG/Twitter tags, JSON-LD Organization with contact info)
  - `sitemap.xml` (both languages, lastmod) and `robots.txt` (respects the index toggle, blocks `/admin`)
  - Show "last published" time and a diff warning if settings changed but weren't published.
- **News:** list (draft/published/scheduled, languages), editor with sv/en tabs, slug generated from the Swedish title, cover upload to `/uploads/`, live preview; changes go live with Publish.
- **Settings:** retention months, response-time text, manage admin principals.

## Architecture
- `icp-cli` project laid out as RULES.md "Folder structure", flat layout:
  - `icp.yaml` lists `canisters: [canisters/*]`.
  - `canisters/backend` uses the `@dfinity/motoko` recipe.
  - `canisters/frontend` uses the `@dfinity/static-site` recipe (certified-assets canister) with `dir: build/client`.
  - The root `package.json` holds scripts only.
- Frontend: React Router (framework mode, prerender) + Vite + TypeScript + Tailwind CSS.
  - Agent and auth packages: use what the current `icp-cli` / `user-sign-in` skills specify (the `@icp-sdk/*` packages), not legacy `@dfinity/agent` / `@dfinity/auth-client` / `@dfinity/assets`.
  - Read canister IDs at runtime from the `ic_env` cookie.
  - Code-split the admin bundle so public visitors never download it.
  - Generated bindings (`app/bindings/`) are not committed.
- Public pages are prerendered at build time (static HTML per route and language) for SEO and speed, and hydrate afterwards.
- Configuration files in `canisters/frontend/public/`, copied to the root of `dir`. `.ic-assets.json5` is not used: certified-assets ignores it.
  - `_headers`:
    - Security headers: strict Content-Security-Policy, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options. The canister adds no defaults.
    - CSP: `connect-src 'self' https://icp-api.io` (the agent uses icp-api.io on custom domains); the `presync` step adds `http://localhost:*` for local networks only.
    - CSP: no `unsafe-inline` for scripts. React Router's inline hydration scripts are allowed by `sha256` hashes, which a build script calculates and writes into each HTML file's `_headers` block.
    - Cache headers: `immutable` for hashed `/assets/*`, `max-age=0, must-revalidate` for `/*.html`.
  - `_redirects`: rewrites `/admin` and `/admin/*` to the admin shell (status 200). Nothing else falls back. `404.html` serves every other unknown path.
  - `_preserve`: `/uploads/*` (OG images uploaded from admin).
- Local development: `icp network start -d` with a local Internet Identity, and `icp deploy` with `--identity anonymous` (never `prod-identity` locally).
- Production: `icp deploy -e ic` with `prod-identity`. Every mainnet step needs explicit approval.
- **Custom domain** `axelkod.eu` and `www.axelkod.eu`, following the `custom-domains` skill: DNS records, the `.well-known/ic-domains` file (in `public/`, uploaded automatically) and the registration API call. Give step-by-step DNS instructions.
  - The IC can't redirect by hostname. The www → apex redirect is set up at the DNS provider (URL forwarding). If the provider can't do that, register both hostnames and rely on the canonical link pointing to the apex.

## Quality requirements
- Lighthouse ≥ 95 in all categories, on mobile and desktop.
- WCAG 2.1 AA: keyboard navigation, visible focus, contrast, labels, alt text, aria-live for form status.
- Mobile-first and responsive; optimised SVGs; no heavy libraries on public pages.
- SEO: semantic HTML (one h1 per page), descriptive headings, OG image generated from the logo (1200×630), favicon set and web manifest from the logo symbol, `hreflang`, canonical links, sitemap, robots, JSON-LD.
- Privacy: no cookies, no analytics and no third-party requests on public pages, so no cookie banner is needed.
- Security: every admin method checks the caller; reject the anonymous principal; validate all inputs; cap stored sizes; don't log personal data.

## Testing and delivery
1. Repository with a clear structure and a README covering setup, local development, deploy, custom domain, adding the first admin, publishing SEO, cycle top-ups and monitoring, upgrading canisters safely, and backup/export.
2. Motoko unit tests with `mops test` in `canisters/backend/test/` (validation, rate limits, admin checks, retention), plus Playwright end-to-end tests in `canisters/frontend/tests/e2e/` (submit form, admin login with local II, read message, edit contact info, publish SEO).
3. `scripts/deploy.sh` (local and ic) using `icp`, plus an optional GitHub Actions workflow. Locally the script uses `--identity anonymous` unless `ICP_IDENTITY` is set. For mainnet it uses `--identity-password-file ~/.identity-pw` and asks before running.
4. After local verification, clean up disk as RULES.md describes. Never delete `.icp/`.
5. An estimate of monthly cycle cost (storage and contact-form calls) and a top-up plan.
6. A checklist of the manual steps I must do (DNS, first admin principal, `authorize` admins on the frontend canister, first SEO publish).

## Working method
- Track progress in `docs/plan.md` (update each phase's status as work moves).
- First give a short plan, a file tree and the data model; then build in this order: design system → public pages (sv/en) → backend canister → contact form → admin (inbox → contact info → SEO and publish → settings) → deploy and custom domain.
- Ask me before adding any paid service or anything that sends data to third parties.
- Keep texts in i18n files and settings in the canister so I can change them without touching code.
# Axelkod AB website: build plan

Spec: [spcs.md](spcs.md). Source of truth for tooling and layout: `~/.claude/icp/RULES.md`.

Status values: `Not started` · `In progress` · `Blocked` · `Done`.
At the end of each phase: deploy locally, run that phase's checks, and get sign-off before starting the next phase.

## Phase overview

| # | Phase | Status | Verified by |
|---|---|---|---|
| — | Plan, spec reconciliation | Done | Spec matches RULES.md |
| 0 | Scaffold | Done | Local `icp deploy`, both canisters respond |
| 1 | Design system | Done | Visual check, contrast check |
| 2 | Public pages (sv/en) | In progress | Lighthouse ≥ 95, axe, one h1 per page |
| 3 | Backend canister | Done | `mops test` (auth, validation, retention) |
| 4 | Contact form | Done | `mops test` + Playwright form submit |
| 5a | Admin: inbox | Done | Playwright: local II login, read message |
| 5b | Admin: contact info | Done | Playwright edit |
| 5c | Admin: SEO + Publish | Done | Playwright publish, then fetch the HTML head |
| 5d | Admin: settings | Done | `mops test` + Playwright |
| 6 | Deploy + custom domain | In progress | Mainnet deploy (approval at each step) |
| 7 | Redesign + news (R0–R9 below) | Not started | Per step: screenshots, axe, Lighthouse ≥ 95, e2e |

## Phase details

### 0. Scaffold — Done
- [x] `icp.yaml` (`canisters: [canisters/*]`, environments `local` and `ic`, local II via `ii: true`)
- [x] `canisters/backend`: `canister.yaml` (`@dfinity/motoko@v5.0.0`), `mops.toml` (moc 2.2.4, core 2.7.0, lintoko 0.12.0), empty actor, initial pending migration, `backend.did`, `deployed/backend.most` baseline
- [x] `canisters/frontend`: `canister.yaml` (`@dfinity/static-site@v1.0.0`, `dir: build/client`), React Router 8 + Vite 8 + TS 7 + Tailwind 4, prerender `/`
- [x] Root `package.json` with scripts only
- [x] Local deploy with `--identity anonymous`: frontend serves certified HTML with `ic_env` cookie, backend running, local II responds

### 1. Design system — Done
- [x] Self-hosted Barlow Condensed 600/700 and Inter Variable (`@fontsource`, bundled woff2, no third-party requests)
- [x] Tailwind 4 tokens in `app/app.css`: navy/teal/grey scales + semantic `bg/surface/fg/muted/border/accent/brand`; light by default, dark via `prefers-color-scheme` (CSS only, no inline script for the CSP)
- [x] `Logo` and `LogoSymbol` (`app/components/Logo.tsx`, generated from `docs/brand/`, navy = `currentColor`); line icons (`Icons.tsx`)
- [x] `CircuitBackground`: traces + hexagon nodes at the edges, pulse animation off under `prefers-reduced-motion`
- [x] Focus ring, `.btn`/`.card` components; brand teal (3.2:1 on white) only for decoration/large text, `teal-700`/`teal-300` for text
- [x] Verified: screenshots (light, dark, 390 px), `tests/e2e/a11y.spec.ts` (axe WCAG 2.1 AA incl. contrast, one h1, focus) passes in both themes
- Note: `app/routes/home.tsx` is a temporary design preview, replaced in Phase 2

### 2. Public pages (sv/en) — In progress (Lighthouse run pending)
- [x] Prerendered `/`, `/en/`, `/integritet`, `/en/privacy`, `404.html` (`scripts/postbuild.mjs` renames `<page>/index.html` to `<page>.html` for the canister's clean URLs)
- [x] Header (logo, anchors, language switch), Hero, What we do (3 cards), Why Axelkod (4 points), Contact placeholder, Footer, skip link
- [x] i18n files `app/i18n/{sv,en}.json` (en typed against sv), `lang` attribute, hreflang + x-default, canonical, OG/Twitter tags, Organization JSON-LD (defaults in `app/lib/seo.ts`, replaced by backend SEO settings in 5c)
- [x] Favicon set (svg follows theme, ico, apple-touch, 192/512/maskable), web manifest, OG image 1200×630 (`npm run brand-assets`, output committed)
- [x] `_headers` (base security + caching; postbuild appends per-file CSP with sha256 script hashes, no `unsafe-inline`), `_preserve` (`/uploads/*`), `sitemap.xml`, `robots.txt`
- [ ] `_redirects` admin rewrite: added in 5a together with the admin shell
- [x] Verified: 21 Playwright tests (axe AA on all pages in both themes, one h1, skip link/focus, lang/canonical/hreflang, no console or CSP errors, client-side hydration, 404 status, sitemap/robots, no third-party requests); screenshots desktop/mobile
- [ ] Lighthouse ≥ 95 mobile + desktop (blocked: needs permission to run `npx lighthouse`)

### 3. Backend canister — Done
- [x] `types.mo`: Message, ContactInfo, SeoSettings, SiteSettings, Config, Error (variant), API views
- [x] Admins mixin: optional install arg `firstAdmin` (only while no admins), controllers may also add/remove admins, anonymous rejected, last admin can't be removed, every change mirrored with `authorize`/`deauthorize` on the frontend (bounded wait, rolled back on failure), `syncAdminsToFrontend`, `whoami`
- [x] Settings mixin: get/set contact, SEO (with updatedAt/publishedAt), site; `getPublicConfig` applies show flags; all input cleaned (control chars) and validated (lengths, email, https URLs, safe verification tokens)
- [x] Messages mixin: list (filter, search, paging ≤ 100, unread count), setStatus, setNote, delete, CSV export (formula-injection safe); 24 h retention timer re-registered on every start
- [x] `src/backend.did` generated and committed; pending initial migration holds all defaults
- [x] `scripts/deploy.sh local`: deploy, add backend as frontend controller, optional `FIRST_ADMIN`, sync admins
- [x] Verified: `mops test` (validation, settings, paging/search, retention, CSV, auth) and local calls (frontend refuses until backend is controller; add/remove mirrored; last-admin guard; anonymous gets `notAuthorized`; sync restores a removed authorization; upgrade keeps state)

### 4. Contact form — Done
- [x] `getFormToken(nonce)` query: `<issuedAt>.<clientNonce>.<HMAC-SHA256>` (secret from `raw_rand` via a timer after install; `sha2` dependency, HMAC tested against RFC 4231), ≥ 3 s, ≤ 2 h, single use (used tokens pruned after 2 h)
- [x] `submitContact`: honeypot (fake success, nothing stored), global limits 20/h and 100/day, 3 per email per day, field caps, control-character stripping, consent required; `inspect` drops calls > 16 KB; controller-only `resetFormLimits()` clears the global window (ops + local test setup)
- [x] Form (sv/en): client validation mirroring the canister, inline errors with `aria-invalid`/`aria-describedby`, focus on first invalid field, `aria-live` status, success text uses the admin's response-time text, automatic token refresh + one retry
- [x] Contact details card, footer (org. nr, email, phone) and privacy retention loaded from `getPublicConfig`; agent loaded lazily (not in the initial bundle)
- [x] CSP `connect-src 'self' https://icp-api.io`; `presync` adds `http://localhost:*` on non-mainnet networks
- [x] Verified: `mops test` (4 files), local canister calls (too fast, reuse, tamper, honeypot, consent, per-email limit, oversized arg), 27 Playwright tests incl. real submits in sv/en and axe in both themes

### 5a. Admin: inbox — Done
- [x] `/admin` served from the SPA fallback renamed `admin.html` (`noindex` header + meta), `_redirects` `/admin/*` → `/admin.html` 200; admin/auth code in separate chunks, never loaded by public pages
- [x] II login (`@icp-sdk/auth` 11): id.ai (real passkeys) everywhere by default, also locally; the local test II (`ii: true`, seed-index prompt) only when `localStorage["axelkod:ii"] = "local"` (e2e tests); `derivationOrigin` = frontend canister address on custom domains only; `ii-alternative-origins` with CORS header; "Åtkomst nekad" shows the principal to add
- [x] Inbox (Swedish UI): status filters with unread count, debounced search, paging (25), detail view, opening a new message marks it read, status buttons, internal note, delete with confirm, CSV export (UTF-8 BOM for Excel), unread badge
- [x] Verified: 34 Playwright tests incl. admin shell (axe, noindex, CSP, popup to local II `/authorize`) and `tests/api/admin-api.spec.ts` (real admin with an in-memory key: list/search/status/note/export/delete, settings round-trip, anonymous refused)
- [x] Browser login via local II (`tests/e2e/admin-login.spec.ts`): the local II runs with dummy auth, so identity creation asks for a "seed index" in a browser prompt instead of a passkey; the test answers it, gets "Åtkomst nekad", is granted admin by the local controller, then searches, opens, notes, marks handled, exports and deletes a message

### 5b. Admin: contact info — Done
- [x] `/admin/contact`: all ContactInfo fields + show flags, live preview with the same `ContactDetails` component the site uses (show flags applied as in the canister), unsaved-changes state and undo, server validation errors shown on the field
- [x] Public site reads contact info at runtime, so a save is live immediately (no deploy or Publish)
- [x] Verified: `tests/e2e/admin-contact.spec.ts` (local II admin edits phone/org.nr, preview follows flags, invalid email rejected by the canister, public page shows the change; original restored). Suite runs with one worker since tests share the local canister

### 5c. Admin: SEO + Publish — Done
- [x] Shared renderer `app/lib/seo-head.ts` (pure, import-free): head tags between `x-seo` markers + JSON-LD + embedded `seo-data` JSON; React hydrates from the embedded data, so baked/published HTML and the client always agree. Used by React, `postbuild` (sitemap/robots), `presync` and Publish
- [x] `presync` bake: reads `getPublicConfig` from the backend (agent + generated IDL) and rewrites `/`, `/en/`, `/integritet`, `/en/privacy`, sitemap.xml, robots.txt at every deploy
- [x] Publish (browser): fetches the live pages, replaces the SEO region (scripts replaced in place, React 19 hoists them), copies the live security headers (CSP hashes unaffected), one atomic `upload_assets` call (≤ 1.9 MB), then `markSeoPublished()`
- [x] `/admin/seo`: sv/en tabs, counters (~60/~155), Google result preview, keywords/OG fields, OG image upload to `/uploads/og-*.{png,jpg,webp}` (`upload_asset`, ≤ 1.9 MB, kept by `_preserve`), canonical base, index toggle (noindex pages leave the sitemap; robots `Disallow: /` only if both are noindex), organisation JSON-LD fields, verification tokens; "Senast publicerat" + warning when settings or contact info changed after the last Publish
- [x] `admin.html` stripped of the public SEO block (the SPA fallback is prerendered as `/`)
- [x] Verified: `tests/e2e/admin-seo.spec.ts` (edit, validation, OG upload served as image/png, publish, live title/og:image/headers, no hydration or CSP errors, sitemap lastmod, restore + re-publish) and `tests/api/seo-bake.spec.ts` (`icp deploy frontend` reproduces backend settings incl. noindex); 38 tests pass

### 5d. Admin: settings — Done
- [x] `/admin/settings`: retention months (1–60, shown on the privacy page, enforced by the daily timer) and response-time text per language (shown after a submit); live on save
- [x] Admin management: list (own entry marked), add by principal (validated, anonymous refused), remove with confirm (extra warning for yourself), last admin can't be removed; every change is mirrored with `authorize`/`deauthorize` on the frontend canister by the backend
- [x] Admin pages pass axe (WCAG 2.1 AA); contact card `<dl>` structure fixed
- [x] Verified: `tests/e2e/admin-settings.spec.ts` (validation, privacy page shows new retention, add/remove reflected in `list_authorized`), `tests/e2e/admin-a11y.spec.ts`; 40 tests pass

### 6. Deploy + custom domain — In progress (local parts done; mainnet awaits approval)
- [x] `scripts/deploy.sh local|ic`: mainnet as prod-identity with `--identity-password-file`, typed confirmation before the deploy and before adding the backend as frontend controller, cycles balance shown, `mops check` before and `mops deployed` after
- [x] `.well-known/ic-domains` (`axelkod.eu`, `www.axelkod.eu`); `ii-alternative-origins` already in place
- [x] README: setup, local dev, tests, mainnet deploy, first admin, custom domain DNS + registration + www forwarding, Publish, cycles estimate (≈ 0.1T/month; ≈ 4.2T first deploy) and top-ups, safe upgrades, backup/export, manual-steps checklist
- [x] Disk cleanup after local verification (unused PocketIC temp folders removed; `.icp/` kept)
- [ ] Optional GitHub Actions workflow (not built; ask if wanted)
- [ ] Mainnet deploy (explicit approval at each step)
- [ ] DNS, domain registration, first admin, first Publish (manual steps in README)

### 7. Redesign + news — Not started

Goal: a completely new, modern, animated look (dark-first glow), a news section with article pages, and two new sections replacing "Why Axelkod". Decided 2026-11-24: dark-first glow; **Security by design** + **Industries we serve**; news = cards + article pages baked into HTML; animations with the **Motion** library.

**Fixed constraints (unchanged from the spec):** strict CSP (no `unsafe-inline`; Motion's start states live in CSS classes, not prerendered `style=""` attributes), Lighthouse ≥ 95 mobile/desktop, WCAG 2.1 AA (contrast on gradients, focus, keyboard), `prefers-reduced-motion` turns every animation off, no third-party requests (no hotlinked fonts/images/video), sv/en for every text, "reveal little" copy, prerendered public pages.

**Design direction**
- Base: deep navy (`#020d18` → `#032843`), brand teal `#05A390` plus a lighter cyan glow; slow aurora gradient fields, fine grid/noise texture, glass panels (blur + 1 px light border), gradient text for headings, teal glow on primary buttons.
- Motion language: short (200–600 ms), eased, staggered reveals on scroll; hover spotlight on cards (cursor-following radial glow); hero network (hexagon nodes + circuit traces from the logo) drawn on a lightweight canvas, paused off-screen.
- Light mode as an option via a toggle (theme script hashed into the CSP like the other inline scripts).

**Steps** (each ends with a local deploy, screenshots, axe and e2e; R2 is a sign-off gate)
- [ ] **R0 Content + inspiration**: draft sv/en copy for the new sections (industries list, security layers) for your approval; decide news fields.
- [ ] **R1 Design system v2**: new tokens (surfaces, glows, gradients, glass), type scale, spacing, radius, shadows; Motion setup (`LazyMotion` + `domAnimation`, lazy-loaded, ~15–20 KB gz budget); `Reveal`/`Stagger` primitives with CSS start states; reduced-motion handling; theme toggle.
- [ ] **R2 Shell + hero (gate)**: sticky glass header (shrinks on scroll, active-section indicator, animated mobile menu), new hero (animated network canvas, staggered gradient headline, two CTAs, scroll cue), new footer. **Screenshots for your sign-off before continuing.**
- [ ] **R3 Services**: bento grid of the three areas with spotlight hover, animated icons (gear turns, code types, shield scans), one sentence each.
- [ ] **R4 Security by design**: interactive layered shield (code, infrastructure, people, supply chain); layers highlight on hover/focus/scroll, keyboard accessible (buttons + `aria-controls`), text panel per layer.
- [ ] **R5 Industries we serve**: animated tiles (icon + one line each) with staggered reveal.
- [ ] **R6 News backend**: `News` type (id, slug, status draft/published, publishedAt, cover image URL, sv/en title, excerpt, body); admin create/edit/delete/publish, public `listNews(lang, limit, offset)` and `getNews(slug)`; validation and size caps (body ≤ 20 000 chars); body in a safe Markdown subset (paragraphs, headings, lists, links, bold/italic; no raw HTML); added to the still-pending initial migration (local backend reinstall); `mops test`.
- [ ] **R7 News admin**: "Nyheter" tab (list, editor with sv/en tabs, live preview, slug from title, cover upload to `/uploads/`, draft/publish, delete); site Publish also writes news.
- [ ] **R8 News on the site**: 3 latest as cards on the landing page (cover or a generated gradient/hexagon artwork per article); list pages `/nyheter`, `/en/news`; article pages `/nyheter/<slug>`, `/en/news/<slug>`. Pages are generated from a prerendered article template: deploy (`presync`) and Publish write one HTML file per article with its content and SEO baked in (same marker + embedded-JSON method as the SEO head, so hydration matches); sitemap lists articles; `_redirects` sends unknown article URLs to 404. Publish batches uploads under the 2 MB limit.
- [ ] **R9 Restyle the rest + QA**: contact section (glass form, animated success), privacy, 404, admin restyled to match (lighter touch); update spec; full e2e, axe in both themes, Lighthouse mobile/desktop, reduced-motion pass, bundle-size check, screenshots at 390/768/1280 px.

**Risks and how they're handled**
- Motion vs. CSP and hydration: animate only after hydration from CSS start states; no SSR inline styles.
- Performance: Motion and the hero canvas load after first paint; the canvas pauses when hidden; budgets checked in R9 (Lighthouse needs the pending decision on how to run it).
- Contrast on gradients: text sits on solid or blurred panels; axe in both themes.
- News pages for SEO add generated files per article: kept small, uploaded in batches, reproduced at every deploy.

## Decisions
| Decision | Choice |
|---|---|
| Tooling | `icp-cli`, not dfx |
| Frontend canister | `@dfinity/static-site` (certified-assets), configured with `_headers`, `_redirects` and `_preserve` |
| SEO publish | Backend holds the SEO settings. `presync` bakes them in at deploy; the admin's Publish uses `upload_assets` from an `authorize`d principal |
| CSP | `sha256` hashes for inline hydration scripts, written into `_headers` for each file |
| www → apex | Forwarding at the DNS provider (the IC can't redirect by hostname) |
| II principals | Primary origin = frontend canister address; custom domain derives against it via `ii-alternative-origins` (user-sign-in skill; replaces the spec's `https://axelkod.eu`) |
| Redesign | Dark-first glow; Motion library (CSS start states, no inline styles); news with article pages baked at Publish/deploy; Security by design + Industries replace Why Axelkod (2026-11-24) |
| Admin → frontend authorize | Backend canister is a controller of the frontend canister (user decision 2026-11-24) |

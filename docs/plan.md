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
| 5b | Admin: contact info | Not started | Playwright edit |
| 5c | Admin: SEO + Publish | Not started | Playwright publish, then fetch the HTML head |
| 5d | Admin: settings | Not started | `mops test` + Playwright |
| 6 | Deploy + custom domain | Not started | Mainnet deploy (approval at each step) |

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
- [x] II login (`@icp-sdk/auth` 11): local II on `*.localhost`, mainnet default; `derivationOrigin` = frontend canister address on custom domains only; `ii-alternative-origins` with CORS header; "Åtkomst nekad" shows the principal to add
- [x] Inbox (Swedish UI): status filters with unread count, debounced search, paging (25), detail view, opening a new message marks it read, status buttons, internal note, delete with confirm, CSV export (UTF-8 BOM for Excel), unread badge
- [x] Verified: 34 Playwright tests incl. admin shell (axe, noindex, CSP, popup to local II `/authorize`) and `tests/api/admin-api.spec.ts` (real admin with an in-memory key: list/search/status/note/export/delete, settings round-trip, anonymous refused)
- [x] Browser login via local II (`tests/e2e/admin-login.spec.ts`): the local II runs with dummy auth, so identity creation asks for a "seed index" in a browser prompt instead of a passkey; the test answers it, gets "Åtkomst nekad", is granted admin by the local controller, then searches, opens, notes, marks handled, exports and deletes a message

### 5b. Admin: contact info — Not started
- [ ] Edit all ContactInfo fields with a live preview

### 5c. Admin: SEO + Publish — Not started
- [ ] Per-language tabs, character counters, Google result preview, JSON-LD fields, verification tokens
- [ ] OG upload to `/uploads/*` (`upload_asset`)
- [ ] Head renderer shared by the build (`presync` bake) and Publish (`upload_assets`)
- [ ] Publish writes `index.html`, `en/index.html`, `sitemap.xml`, `robots.txt`
- [ ] "Last published" time and a warning when settings changed but weren't published

### 5d. Admin: settings — Not started
- [ ] Retention months, response-time text
- [ ] Manage admins (also `authorize`/`deauthorize` on the frontend)

### 6. Deploy + custom domain — Not started
- [ ] `scripts/deploy.sh` (local / ic), optional GitHub Actions workflow
- [ ] `.well-known/ic-domains`, DNS steps, domain registration, www → apex forwarding at the DNS provider
- [ ] README (setup, deploy, domain, first admin, Publish, cycles, upgrades, backup)
- [ ] Cycle-cost estimate and top-up plan; manual-steps checklist
- [ ] Mainnet deploy (explicit approval at each step)

## Decisions
| Decision | Choice |
|---|---|
| Tooling | `icp-cli`, not dfx |
| Frontend canister | `@dfinity/static-site` (certified-assets), configured with `_headers`, `_redirects` and `_preserve` |
| SEO publish | Backend holds the SEO settings. `presync` bakes them in at deploy; the admin's Publish uses `upload_assets` from an `authorize`d principal |
| CSP | `sha256` hashes for inline hydration scripts, written into `_headers` for each file |
| www → apex | Forwarding at the DNS provider (the IC can't redirect by hostname) |
| II principals | Primary origin = frontend canister address; custom domain derives against it via `ii-alternative-origins` (user-sign-in skill; replaces the spec's `https://axelkod.eu`) |
| Admin → frontend authorize | Backend canister is a controller of the frontend canister (user decision 2026-11-24) |

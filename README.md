# Axelkod AB website

Company website for Axelkod AB on the Internet Computer: a prerendered bilingual (sv/en) public site with a contact form, plus an admin area (Internet Identity) for the inbox, contact details, SEO and settings.

- Spec: [docs/spcs.md](docs/spcs.md) · Build plan and status: [docs/plan.md](docs/plan.md)
- Tooling and conventions: `~/.claude/icp/RULES.md` (icp-cli, not dfx)

```text
icp.yaml                  networks/environments, canisters: [canisters/*/*]
scripts/deploy.sh         local and mainnet deploy
canisters/backend/site/   Motoko (mo:core): messages, settings, admins, contact-form token
canisters/frontend/       pnpm workspace root
  web/                    React Router (prerendered) + Tailwind, @dfinity/static-site recipe
    public/               _headers, _redirects, _preserve, .well-known/, icons, OG image
    scripts/              postbuild (clean URLs, CSP hashes), presync (SEO bake), brand assets
    tests/                Playwright: e2e/ (browser), api/ (canister calls)
```

## Setup

Requirements: Node ≥ 22, pnpm (`corepack enable pnpm`), `icp` (icp-cli), `ic-wasm`, `mops`, `jq`.

```bash
npm run install:all          # frontend pnpm install + backend mops install
```

Behind the office TLS proxy, Node needs `NODE_EXTRA_CA_CERTS=~/.local/share/certs/volvo-got-fw-rootca-2026-10.pem` (see RULES.md).

## Local development

```bash
scripts/deploy.sh local      # starts the local network, deploys, wires admin permissions
```

- Site: http://web.local.localhost:8000/ · Admin: http://web.local.localhost:8000/admin
- Local deploys use `--identity anonymous` (override with `ICP_IDENTITY`); never `prod-identity`.
- Sign-in uses the real Internet Identity (`https://id.ai`, your passkey) also locally; the local network trusts its signatures. Use a normal browser (Chrome, Edge, Firefox), not an embedded one such as VS Code's Simple Browser, which blocks passkeys and pop-up dialogs.
- Offline alternative: the local network's own II (`ii: true`) runs in test mode and asks for a "seed index" (any number) instead of a passkey, via `window.prompt`. Enable it in the browser console with `localStorage.setItem("axelkod:ii", "local")` and reload; the e2e tests do this. Remove the key to go back to id.ai.
- Become admin locally: sign in, copy the ID from "Begär åtkomst" (copy button), then
  `npm run admin:add`, paste the ID when asked, and reload.

## Tests

```bash
npm run test:backend         # mops test: validation, settings, inbox, retention, CSV, HMAC, form token, limits
npm run test:e2e             # Playwright against the local deployment (deploy first)
```

The e2e suite covers accessibility (axe, both themes), CSP and headers, SEO tags, the contact form, local II sign-in and every admin page, and a deploy-time SEO bake (`tests/api/seo-bake.spec.ts` runs `icp deploy web`). Tests share the local canister, so they run one at a time.

After a test session, free disk space as RULES.md describes (Motoko builds need no cleanup; delete unused `/tmp/.tmp*` PocketIC folders; never delete `.icp/`).

## Mainnet deploy

Every mainnet step needs explicit approval; the script asks before each one.

```bash
scripts/deploy.sh ic                       # as prod-identity, password from ~/.identity-pw
FIRST_ADMIN=<principal> scripts/deploy.sh ic   # also adds an admin
```

The script: shows the cycles balance, runs `mops check` (stable-memory compatibility with the last deploy), deploys both canisters, adds `site` as a controller of `web` (needed to authorize admins for Publish; asks first), optionally adds `FIRST_ADMIN`, syncs admin permissions, and promotes the deployed stable signature (`mops deployed`).

After a mainnet deploy, **commit `.icp/data/`** (mainnet canister IDs) and `canisters/backend/site/deployed/`.

### First admin

1. Open `https://<web-id>.icp.net/admin` (later `https://axelkod.eu/admin`) and sign in with Internet Identity (a passkey).
2. The page shows "Begär åtkomst" and your ID (principal). Copy it with the copy button.
3. Run `FIRST_ADMIN=<principal> scripts/deploy.sh ic`, or just the add step:
   `icp canister call site addAdmin '(principal "<principal>")' -e ic --identity prod-identity --identity-password-file ~/.identity-pw`
4. Reload `/admin`. Further admins are added from **Inställningar** in the admin.

Admin identities are anchored on the frontend canister address, so the same passkey works on `*.icp.net` and on `axelkod.eu` (via `/.well-known/ii-alternative-origins`). Sign in for the first time only after the canister exists; do not change which canister serves the site later.

## Custom domain (axelkod.eu)

Follow these steps after the first mainnet deploy (`.well-known/ic-domains` already lists `axelkod.eu` and `www.axelkod.eu`).

1. At the DNS provider, turn off any SSL/TLS or "universal SSL" offering for the domain.
2. Add the records (`<web-id>` = the frontend canister ID from `.icp/data/mappings/ic.ids.json`):

   | Type | Host | Value |
   |---|---|---|
   | ALIAS/ANAME (CNAME flattening) | `axelkod.eu` | `axelkod.eu.icp1.io` |
   | TXT | `_canister-id.axelkod.eu` | `<web-id>` |
   | CNAME | `_acme-challenge.axelkod.eu` | `_acme-challenge.axelkod.eu.icp2.io` |

   Apex domains can't use a plain CNAME; if the provider has no ALIAS/ANAME, ask before choosing another setup. Keep exactly one `_canister-id` TXT record.
3. **www → apex:** set up URL forwarding (301) from `www.axelkod.eu` to `https://axelkod.eu` at the DNS provider; the IC can't redirect by hostname. If the provider can't forward, register `www.axelkod.eu` the same way (CNAME to `www.axelkod.eu.icp1.io`, plus its own `_canister-id` TXT and `_acme-challenge` CNAME); the canonical links point to the apex.
4. Validate, register and wait for `registered`:

   ```bash
   curl -sL "https://icp.net/custom-domains/v1/axelkod.eu/validate" | jq
   curl -sL -X POST "https://icp.net/custom-domains/v1/axelkod.eu" | jq
   curl -sL "https://icp.net/custom-domains/v1/axelkod.eu" | jq '.data.registration_status'
   ```

   On the office network `curl` fails for IC hosts (stale proxy CA, see RULES.md); run these from another network or after the system CA store is updated.
5. Check `https://axelkod.eu`, then sign in at `https://axelkod.eu/admin`: you should get the same admin ID as on the canister address.

## Publishing SEO

1. Admin → **SEO**: edit per language, then **Spara**.
2. **Publicera** rewrites the public pages (metadata, news, and the home-page sections edited under Admin → **Startsida**), `sitemap.xml` and `robots.txt` on the live site in one atomic call. Home-page edits are drafts until then. "Senast publicerat" shows when; a warning appears when SEO settings or contact details changed since.
3. Every deploy re-bakes the same output from the backend, so deploys and Publish never drift.

Contact details (including the map snapshot made from the coordinates, see below), retention and response time are read by the site at runtime and are live on save (contact details also feed the published JSON-LD, so publish after changing them).

### Contact map

Admin → Kontaktuppgifter takes latitude/longitude. On save the admin's browser draws OpenStreetMap tiles into an image and uploads it to `/uploads/map-*.jpg`; the site shows that file behind the contact card (credited "© OpenStreetMap"), so visitors never contact OpenStreetMap. Empty coordinates remove the map.

## Cycles: cost and top-ups

1T cycles ≈ 1 USD (set by the NNS; check the current rate).

| Item | Cycles |
|---|---|
| First deploy: create 2 canisters (2T each + fees) | ≈ 4.2T once |
| Idle burn (memory, ~20 MB each; `icp canister status` reports ≈ 1.4B/day per canister) | ≈ 0.08T / month for both |
| Contact form (query token + one update per message) and admin calls | well under 0.01T / month at normal volume |
| Growth: ~3 KB per stored message; 10,000 messages ≈ 30 MB more | ≈ +0.03T / month |

Expected running cost: roughly **0.1T per month (about 0.1 USD)**. The 2T each canister starts with lasts years at that rate, but keep both above the freezing reserve:

- Check quarterly: `icp canister status site -e ic --identity prod-identity --identity-password-file ~/.identity-pw` (and `web`).
- Top up when either drops below 1T: `icp canister top-up site --amount 1t -e ic …` (from prod-identity's cycles; get cycles with `icp cycles mint` from ICP, or by card with `icp cycles buy`).
- Consider adding a backup controller principal so losing prod-identity doesn't lock the canisters.

## Upgrading canisters safely

- Backend state lives in a persistent actor. Changes that aren't stable-compatible go in the single pending migration in `canisters/backend/site/src/migrations/` (never edit an applied one).
- `mops check` compares against `canisters/backend/site/deployed/site.most` (the mainnet baseline) and fails on incompatible changes; the deploy script runs it before shipping and updates the baseline after.
- After an interface change: `cd canisters/backend/site && mops generate candid site` and commit `src/site.did` (frontend bindings are generated from it).
- Never `--mode reinstall` on mainnet: it wipes all messages, settings and admins.
- Upgrading the frontend keeps `/uploads/*` (`_preserve`) and the authorized admins; a frontend reinstall clears authorizations, so run `icp canister call site syncAdminsToFrontend '()' -e ic …` after one.

## Backup and export

- Messages: Admin → Inkorg → **Exportera CSV** (UTF-8, opens in Excel; formulas neutralised).
- Whole canister state: `icp canister snapshot` (see `icp canister snapshot --help`); take one before risky upgrades.
- Retention deletes messages older than the configured months once a day; export first if you need them longer.
- If a bot uses up the contact form's daily quota (100/day, 20/hour), reset it as controller:
  `icp canister call site resetFormLimits '()' -e ic --identity prod-identity --identity-password-file ~/.identity-pw`.

## Manual steps checklist

- [ ] Fund prod-identity with ≈ 5T cycles for the first deploy (`icp cycles balance -n ic`).
- [ ] `scripts/deploy.sh ic` (approve each step: deploy, site as web controller).
- [ ] Commit `.icp/data/` and `canisters/backend/site/deployed/`.
- [ ] Sign in at `https://<web-id>.icp.net/admin`, copy your ID, add yourself as admin (`FIRST_ADMIN=…`).
- [ ] Optionally add a backup controller to both canisters.
- [ ] DNS: disable provider TLS, add ALIAS + `_canister-id` TXT + `_acme-challenge` CNAME; www forwarding.
- [ ] Validate and register `axelkod.eu`; wait for `registered`; check the site and admin sign-in on the domain.
- [ ] Admin: fill in contact details (email, phone, org. nr, address) and check SEO texts; **Publicera**.
- [ ] Have the privacy notice reviewed (legal basis, storage on the Internet Computer, IMY).
- [ ] Submit `https://axelkod.eu/sitemap.xml` in Google Search Console / Bing Webmaster Tools (verification tokens go in Admin → SEO).
- [ ] Put a quarterly cycles check in the calendar.

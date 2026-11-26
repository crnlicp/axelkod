# Accounting as a reusable module: plan

Goal: the accounting module (backend canisters `accounting` + `vault`, and the Ekonomi UI) can be dropped into any React ICP project, while axelkod keeps working unchanged after every phase.

Status values: `Not started` · `In progress` · `Blocked` · `Deferred` · `Done`.

**Deferred (2026-11-26):** no second consumer yet, and A10 (mainnet) comes first. Resume when a real second project needs the module; then do M1–M3 first, and M7–M8 only for outside users. Until then, add no new imports from `admin/*` or `components/*` in the accounting code.
Each phase ends with a local deploy, the full Playwright run green in axelkod, and your sign-off. No new dependencies without asking.

## Starting point (2026-11-26)

- Backend is already independent: `accounting` and `vault` have no ties to `site`. Accounting finds vault through `PUBLIC_CANISTER_ID:vault`. Each has its own roles and Internet Identity caller checks.
- Frontend: about 93 files and 12k lines in `web/app/admin/accounting/` and `web/app/routes/admin/accounting/`. It has its own UI kit, `i18n/{sv,en}` and context. `accountingActors(identity)` already takes the identity from the host.
- Ties to the host app:
  - `admin/toast`, used in 31 places;
  - `admin/i18n` (`useAdminLang`);
  - `components/Icons`;
  - the admin `layout.tsx` and the entries in `routes.ts`;
  - the global CSS tokens and classes (`card`, `btn`, `input`, `--error` and so on);
  - the bindings in `app/bindings/*`;
  - the canister ID and root key read from the `ic_env` cookie.

## Phase overview

| # | Phase | Status | Verified by |
|---|---|---|---|
| M0 | Plan and decisions | Deferred | Your sign-off |
| M1 | Package skeleton: move the UI into `canisters/frontend/packages/accounting-ui` (pnpm workspace), and `web` imports from it | Not started | Type check, full Playwright run in `web` |
| M2 | Host seams: a `<AccountingProvider>` with `identity`, `canisterIds`, `rootKey`, `lang`, `toast`, `icons` and `basePath`; remove the imports from `admin/*` and `components/*` | Not started | `grep` shows no `../admin`/`../components` imports in the package; Playwright |
| M3 | Routes as an export: `accountingRoutes(basePath)` for React Router, plus a layout slot; axelkod mounts it under `/admin/accounting` | Not started | Same URLs as now; Playwright |
| M4 | Styling: package stylesheet with documented CSS tokens and a Tailwind `@source` note; no reliance on the host's `app.css` | Not started | Visual check in light and dark, axe |
| M5 | Bindings and config: bindings generated inside the package from `src/accounting.did` / `src/vault.did`; IDs and root key passed in, with the `ic_env` cookie as the default | Not started | Works with and without icp-cli's cookie |
| M6 | Backend as a drop-in: a `canister.yaml` snippet and `icp.yaml` example for `accounting` + `vault`, first-owner setup documented | Not started | Deploy into an empty test project |
| M7 | Standalone template: `examples/accounting-standalone` (II login, static-site frontend, the two canisters) | Not started | `icp deploy` local, sign-in, setup wizard |
| M8 | Tests: accounting e2e and helpers run against both axelkod and the template | Not started | Both runs green |
| M9 | Docs: README for the package (install, provider props, routes, theming, upgrade notes) | Not started | Your review |

## Decisions to make (M0)

| # | Question | Proposal |
|---|---|---|
| D1 | Package or copy-in folder? | A pnpm workspace package, not published to npm for now. |
| D2 | Router | Stay on React Router; other routers are out of scope. |
| D3 | Language | The host passes `lang` (`sv` or `en`); the package keeps its own dictionaries. |
| D4 | Theming | CSS variables with the same names as today; the host can override them. |
| D5 | Where the backend lives | Unchanged under `canisters/backend/`; the template references it. |

## Rules for every phase

- Axelkod behaviour, URLs and data stay the same. No canister interface or state changes, so no migrations.
- Move first, then change: a move commit with no logic changes, then the seam changes.
- Mainnet is untouched.

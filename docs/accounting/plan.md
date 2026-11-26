# Accounting module: build plan

Spec: [../axelkod-accounting-spec.md](../axelkod-accounting-spec.md). Source of truth for tooling and layout: `~/.claude/icp/RULES.md` plus the ICP skills. Where this plan and the spec disagree, the plan applies (see "Conflicts and resolutions").

Status values: `Not started` · `In progress` · `Blocked` · `Done`.
Each phase ends with a local deploy, that phase's checks, and your sign-off. Mainnet steps need your explicit approval each time.

## Phase overview

| # | Phase | Status | Verified by |
|---|---|---|---|
| A0 | Plan, spec reconciliation, decisions | Done (2026-11-25) | Your sign-off |
| A1 | Repo restructure to grouped layout | Done (2026-11-25, branch `accounting`) | Local deploy, all existing tests pass unchanged |
| A2 | Ledger core (backend): roles, settings, fiscal years, BAS, numbering, vouchers, audit, vault | Done (2026-11-25) | `mops test` both canisters |
| A3 | Ekonomi shell + UI kit + PDF pipeline + setup wizard + Bokföring UI | Done (2026-11-25) | Playwright, axe, PDF snapshot test |
| A4 | Sales | Done (2026-11-25) | `mops test` + Playwright (hash-stable re-render) |
| A5 | Purchases, bank, tax account | Done (2026-11-25) | `mops test` + Playwright upload/match |
| A6 | VAT and EU sales list | Done (2026-11-25) | Box fixtures, file checked in Skatteverket's test service |
| A7 | Payroll, AGI, växa | Done (2026-11-26) | Fee-category tests, AGI XML vs XSD, test service |
| A8 | ROT/RUT | Done (2026-11-26), awaiting sign-off | Cap tests, XML vs schema |
| A9 | Assets, inventory, year-end, SRU, SIE4, backup | In progress (A9a done, awaiting sign-off) | SIE4 round trip, restore test |
| A10 | Mainnet (European subnet) | Not started | Approval at each step |

## Conflicts and resolutions

| # | Spec says | Conflicts with | Resolution |
|---|---|---|---|
| C1 | `canisters/accounting/`, `canisters/vault/` next to `backend`/`frontend` | RULES "Grouped layout": more than one backend means group folders and named canisters | `canisters/backend/{site,accounting,vault}` and `canisters/frontend/web`. `icp.yaml` lists `canisters/*/*`. No mainnet IDs exist yet (`.icp/data/mappings` is empty), so the rename needs no ID migration. Done as its own phase (A1) before any new code. |
| C2 | (implied) npm in the frontend | RULES: `canisters/frontend/` is a pnpm workspace root | Switch to pnpm in A1. Only a Windows `pnpm` is on PATH now, so a Linux pnpm is needed (`corepack enable`, see D6). |
| C3 | `accounting.did` at the canister root | RULES: Motoko keeps `src/<name>.did` | `src/accounting.did`, `src/vault.did`, generated with `mops generate candid`. |
| C4 | `app/admin/accounting/` for routes and `app/i18n/{sv,en}/accounting.json` | Existing pattern: pages in `app/routes/admin/`, logic in `app/admin/`, admin texts as a typed TS dict (`app/admin/i18n.tsx`), not JSON | Pages in `app/routes/admin/accounting/`. Logic, pdf, exporters in `app/admin/accounting/`. Texts in `app/admin/accounting/i18n/{sv,en}.ts`, en typed against sv, one file per section so each route loads only its own texts. |
| C5 | "`authorize`d principals on the frontend for admin routes" | static-site: `authorize` grants asset upload rights, not route access. Admin routes are a public SPA, and access control lives in the canisters. | Accounting roles are checked in `accounting` and `vault` only. Accounting-only users (bookkeeper, payroll, auditor) are **never** authorized on the frontend, because that would let them rewrite the website. Only site admins keep frontend authorize, as now. |
| C6 | `accounting` reads company settings from the backend through an inter-canister query at issue time | An `await` between number allocation and storage breaks the atomic, gapless numbering. A cross-subnet call is also needed if the canisters end up on different subnets. Two places would edit the same legal data. | The legal company profile (legal name, org nr, VAT nr, registered office, address, bankgiro, IBAN/BIC, F-skatt, invoice email, Peppol ID) is accounting master data and lives in `accounting`, edited under Ekonomi › Inställningar › Företag (owner only). The setup wizard pre-fills it once from the website contact info. Issuing an invoice is then one synchronous update with no `await`. The spec's aim ("the frontend never supplies the seller snapshot") still holds. |
| C7 | Logo in the PDF header comes from Admin settings (`logoAssetPath`) | Re-rendering an old invoice would show a new logo if the file changes | The logo comes from code (`docs/brand/` → `Logo.tsx`) and is part of the template version. A logo change creates a new template version, and old versions are kept. |
| C8 | `Voucher.correctedBy`, `SalesDoc.paymentIds`, `deliveries`, `Attachment.linkedTo` are fields on posted records | Immutability: posted records must never be rewritten | Posted records are write-once. Links live in append-only index maps (`correctionsOf`, `paymentsOf`, `deliveriesOf`, `attachmentLinks`). Queries return a view record with the links joined in. |
| C9 | `SalesDocStatus` includes `#overdue`, `#paid`, `#partiallyPaid` | These are derived from the date and the payments. Storing them goes stale and needs rewrites. | The stored lifecycle is `#draft · #issued · #credited` (quotes: `#draft · #sent · #accepted · #declined · #expired`). Payment state and overdue are computed in the view. |
| C10 | `InvoiceSnapshot.customer : Customer` | It snapshots internal fields (`active`, `reminderFeeAgreed`, `vatNrCheckedAt`) | A dedicated `PartySnapshot` holds only the printed fields. |
| C11 | `contentHash` = SHA-256 of "canonical JSON" | Motoko and TS must produce the same bytes. Candid encoding is not stable across type changes. | A versioned canonical encoding, `acj-1` (UTF-8, keys sorted, no whitespace, integers only, `null` for absent options, variants as `{"tag":value}`), implemented in `lib/Canonical.mo` and `app/admin/accounting/canonical.ts`. Shared test vectors are kept in one file in the backend group and read by both test suites by relative path. The canister computes the hash at issue. The browser recomputes it before every render and refuses to show "original" on a mismatch. |
| C12 | PDF via `pdf-lib` or `@react-pdf/renderer` | `@react-pdf` lays out with yoga (WebAssembly), which needs `wasm-unsafe-eval` in the CSP. It is also much larger. | `pdf-lib` + `@pdf-lib/fontkit` (pure JS, no eval), with a small in-house layout helper (text wrap, tables, page breaks). Inter TTF is vendored (OFL) for full Swedish glyphs. PDF metadata dates are fixed to the document date so bytes are reproducible. |
| C13 | CSP `worker-src 'self' blob:` | Not needed: Vite emits the worker as a file | `admin.html` only gets `worker-src 'self'` and `frame-src blob:` (for the inline PDF preview). This is added to the per-file CSP in `postbuild.mjs`. Public pages are unchanged. |
| C14 | Validate XML against XSDs "in Playwright" | XSD validation is not a browser task, and there is no `xmllint` on this machine | Exporter unit tests run under the Playwright test runner with no browser (`tests/unit/*.spec.ts`), so no new test framework is needed. XSD validation uses `xmllint-wasm` (dev dependency, D5) against XSDs downloaded into `fixtures/xsd/` with source and date recorded in `docs/accounting/sources.md`. |
| C15 | §5 "Controllers are for deployment only, never admins" | The existing `site` canister lets controllers add admins | `accounting` follows the spec. The first owner comes from the install arg `firstOwner` (only while there are no owners). Recovery is through a second owner, enforced by the setup wizard and the dashboard ("Lägg till en reservägare"). Controllers get no business methods. |
| C16 | vetKeys for vault files and PII | Losing key access would make legally required records unreadable. One `vetkd_derive_key` costs about 26 billion cycles per call. | Envelope encryption. One vetKey per purpose (`docs-v1` for vault files, `pii-v1` for personnummer/addresses/bank accounts) is derived once per session. Each file and field uses a random AES-GCM key wrapped by it. Role rules: `docs-v1` for owner/bookkeeper/auditor, `pii-v1` for owner/payroll (plus bookkeeper for ROT/RUT buyers). Rotation adds `-v2` and rewraps. The full backup contains decrypted data inside a passphrase-encrypted archive, so recovery never depends on vetKeys alone. The vault verifies the ciphertext SHA-256, and `accounting` stores the plaintext SHA-256 computed in the browser. |
| C17 | Vault `getChunk` is an "authorized query" and roles live in `accounting` | A query cannot await another canister cheaply | `accounting` pushes the role list to `vault` on every change (bounded wait, with a `syncRolesToVault` repair method), which is the same pattern as the existing admins → frontend mirror. The vault checks callers locally. |
| C18 | "No heavy computation, browser aggregates" | A trial balance over years of vouchers through paging would take many calls | Each post updates per-(year, account, month) balances and per-(period, VAT code) totals (O(lines), bounded). Reports read these totals. Line-level reports (journal, ledger) page through vouchers. |
| C19 | Deadlines as stored `Obligation` records with status | Dates come from rules plus a holiday calendar. Stored copies go stale. | Deadlines are computed in the browser (`deadlines.ts`: rules + Swedish public holidays). The canister stores only completion facts (filed VAT return, filed AGI, paid). `Obligation` becomes a computed type, not stored state. |
| C20 | Field names `from_`, `end_` | Not reserved in Motoko, so the trailing underscore is noise (checked against `reserved-keywords.md`). The spec has no reserved-word collisions. | Use `from`, `to`, `end`. Keep checking new names (`label`, `type`, `object`, `query`, `class`, `in` are reserved). |
| C21 | "`persistent actor`" | `writing-motoko`: bare `actor` | Bare `actor`, the mops migration chain, and `check-limit = 1` as in `site`. |
| C22 | Storage on the "European subnet" satisfies BFL storage rules | Nodes may include non-EU countries (for example Switzerland). The data is replicated across several countries, and node membership changes over time. | Before mainnet (A10): list the node countries of the chosen subnet and have your accountant confirm what to report to Skatteverket. The setup wizard checklist item records the date and the countries. The monthly full backup stored in Sweden is the fallback. **Legal review item, not a code item.** |
| C23 | VAT return "XML via file" | Skatteverket's momsdeklaration e-service has changed in recent years, and file upload must be confirmed | V3 verifies. If file upload no longer exists, v1 shows the boxes laid out like the e-service form for manual entry, plus the PDF. |
| C24 | Payroll tax tables "import yearly tables" | All tables × columns is a lot of data | Import only the tables in use (one per employee per year) from Skatteverket's open-data file. The canister keeps the imported rows with source and date. Pay runs are calculated in `accounting` (`lib/Payroll.mo`) so totals are trusted and repeatable. |

## Decisions

All recommendations approved on 2026-11-25 (D8: spec order kept).

| # | Question | Decision |
|---|---|---|
| D1 | Canister names for the grouped layout (C1) | `site` (current backend), `accounting`, `vault`, `web` (current frontend) |
| D2 | Keep legal company data in `accounting` instead of the site backend (C6) | Yes |
| D3 | Frontend dependencies: `pdf-lib`, `@pdf-lib/fontkit`, `fflate` (zip for backup), `@icp-sdk/vetkeys` (≥ 0.7) | Approve all four |
| D4 | Motoko dependency: `ic-vetkeys` (mops) for key derivation in `accounting` | Approve |
| D5 | Dev dependency `xmllint-wasm` for XSD validation (C14) | Approve |
| D6 | Install a Linux pnpm via `corepack enable` (C2) | Approve |
| D7 | Feature toggles: hide Lön, ROT/RUT and Lager in the UI until enabled in settings | Yes. Fewer sections for a small company. |
| D8 | Build order. Spec order is VAT before payroll. If you have no employees yet, move payroll (A7) after year-end (A9). | Keep spec order unless you say no employees in 2026 |

## Verification register

Nothing below is coded from memory. Each item is fetched from the official source, and the source and retrieval date are recorded in `docs/accounting/sources.md` before the phase that needs it.

| # | Item | Official source | Phase | Status |
|---|---|---|---|---|
| V1 | Mandatory invoice content | Mervärdesskattelag (2023:200) 17 kap. (riksdagen.se), Skatteverket "Fakturering" pages | A4 | Done (A4) |
| V2 | Simplified invoice limit, foreign-currency VAT in SEK wording | ML 17 kap., Skatteverket | A4 | Done (A4) |
| V3 | VAT return box list, file format, whether file upload still exists | Skatteverket "Fylla i momsdeklarationen" + technical description for file submission | A6 | Done (A6); öre rule open |
| V4 | EU sales list file format and deadlines | Skatteverket "Periodisk sammanställning" + Filöverföring format description | A6 | Done (A6) |
| V5 | VIES REST API, and whether IC HTTPS outcalls can reach it (IPv4/IPv6) | ec.europa.eu VIES technical info, `https-outcalls` skill | A6 | Done (A6) |
| V6 | VAT and AGI deadlines including the 17th exceptions; prepaid tax dates | Skatteverket "Deklarations- och betalningsdagar" | A3 (deadlines) | Done (A3); preliminary tax Jan/Aug exception open |
| V7 | AGI XML schema and current document version, field codes | Skatteverket developer portal (Utvecklarportalen): Arbetsgivardeklaration teknisk beskrivning + XSD | A7 | Done (A7) |
| V8 | Employer contribution rates 2026, youth reduction dates, rate and birth years | Skatteverket "Arbetsgivaravgifter" + the enacted law (SFS) | A7 | Done (A7) |
| V9 | Växa-stöd as a refund application from 2026 | Skatteverket "Växa-stöd" | A7 | Done (A7) |
| V10 | Tax tables open-data format | Skatteverket open data (Skattetabeller) | A7 | Done (A7) |
| V11 | Mileage, per diem, PBB/IBB 2026, car benefit formula | Skatteverket "Belopp och procent 2026" | A7 | Done (A7) |
| V12 | ROT/RUT 2026 rates and caps, XML schema, decision JSON, 2027 fields | Skatteverket "Rot och rut – företag" technical description | A8 | Done (A8) |
| V13 | Riksbank reference rate history | riksbank.se (referensränta) | A4 | Done (A4) |
| V14 | Late-payment compensation and reminder-fee rules | Räntelagen (1975:635), Lag (1981:739) om ersättning för inkassokostnader | A4 | Done (A4) |
| V15 | BAS 2026 accounts and BAS → SRU (INK2R/INK2S) mapping | bas.se, Skatteverket SRU technical description (INK2) | A2 / A9 | Accounts done (A2); SRU open |
| V16 | SRU file format (`INFO.SRU`, `BLANKETTER.SRU`) | Skatteverket "SKV 269" technical description | A9 | Not started |
| V17 | SIE 4C (type 4) spec | sie.se file format description | A9 | Not started |
| V18 | Peppol BIS Billing 3.0 rules and UBL schema | docs.peppol.eu/poacc/billing/3.0/ | A4 | Done (A4) |
| V19 | K2 layout (BFNAR 2016:10) for income statement and balance sheet | bfn.se | A9 | Not started |
| V20 | Bookkeeping, retention and storage rules (BFL 1999:1078, BFNAR 2013:2, 7 kap. storage abroad) | riksdagen.se, bfn.se | A2 | BFL done; BFNAR 2013:2 open |
| V21 | European subnet ID, node count and node countries | ICP dashboard | A10 | Not started |
| V22 | Input VAT: evidence for deduction, reverse charge on purchases (EU goods, EU and non-EU services, domestic), reporting period | ML (2023:200) 13 kap. 31–36 §§, 16 kap. 5–17 §§; Skatteverket "Köpa varor/tjänster från andra EU-länder", "Fylla i momsdeklarationen", "Omvänd betalningsskyldighet inom byggsektorn" | A5 | Done (A5) |
| V23 | BAS 2026 accounts for purchases, reverse charge, expense claims and the tax account | bas.se BAS 2026 (as V15) | A5 | Done (A5) |
| V24 | Tax account (skattekonto): interest treatment, what export the e-service offers | Skatteverket "Skattekonto – betala och få tillbaka", "Ränta på skattekontot" | A5 | Done (A5) |
| V25 | Fixed assets: small-equipment limit, räkenskapsenlig avskrivning (30 % / 20 % rules), restvärdesavskrivning, K2 rules, BAS asset accounts | Inkomstskattelagen (1999:1229) 18 kap. (riksdagen.se), BFNAR 2016:10 (bfn.se), bas.se | A9a | Done (A9a) |
| V26 | Inventory valuation: lowest-value principle, 97 % schablon, FIFO, K2 rules, BAS 1460/4960 | IL 17 kap. (riksdagen.se), BFNAR 2016:10, bas.se | A9a | Done (A9a) |

## Architecture (after resolutions)

```text
canisters/
├── backend/                       # Motoko group (no canister.yaml here)
│   ├── site/                      # today's canisters/backend, renamed
│   ├── accounting/
│   │   ├── canister.yaml  mops.toml  deployed/accounting.most
│   │   ├── test/                  # mops test: one file per lib area
│   │   └── src/
│   │       ├── main.mo            # state + include mixins only
│   │       ├── accounting.did
│   │       ├── types.mo           # shared schema; types/<area>.mo for big areas
│   │       ├── lib/               # Money, Dates (civil date math), Canonical, Numbering, Ledger,
│   │       │                      # Balances, Vat, Invoice, Ocr, Payroll, EmployerFees, RotRut,
│   │       │                      # Assets, Inventory, Audit, Roles, Validate, Seed (BAS, VAT codes, series)
│   │       ├── mixins/            # Roles, Settings, Ledger, Parties, Sales, Purchases, Bank, Vat,
│   │       │                      # Payroll, RotRut, Assets, Inventory, YearEnd, Audit, Parameters, Keys
│   │       └── migrations/
│   └── vault/
│       └── src/ main.mo vault.did types.mo lib/ mixins/ migrations/
└── frontend/                      # pnpm workspace root
    └── web/                       # today's canisters/frontend, renamed
```

**Data flows**
- **Post a voucher / issue an invoice:** a single update. It checks the role, validates, checks the lock date and fiscal-year status, allocates the next number for the (series, year), builds the snapshot, hashes it, writes the voucher and balances, and appends the audit entry. There is no `await`, so numbering is gapless by construction. Drafts never take numbers.
- **Upload a received document:**
  1. The browser hashes the plaintext, encrypts it, and calls `accounting.beginAttachment(meta)` to get a ticket.
  2. The browser sends `vault.putChunk` × n (≤ 1.9 MB each), then `vault.finalize(cipherSha256)`.
  3. The browser calls `accounting.confirmAttachment(ticket, fileId)`. Accounting checks with `vault.fileInfo` (bounded wait) and links the file.
- **Render a document:** the browser fetches the snapshot, recomputes the `acj-1` hash, renders the template `<doc>@<version>` in the PDF worker, and offers download, print or preview.
- **Roles:** `#owner`, `#bookkeeper`, `#payroll`, `#auditor`. They are checked in every `accounting` method and mirrored to `vault`. The anonymous principal is always rejected.

**Memory and cost estimate:**
- Ledger data is a few MB per year, which is negligible.
- Vault: about 600 documents a year × 0.5 MB ≈ 0.3 GB a year, so about 2.5 GB over the 8-year retention.
- Cost: roughly 4 TC per GiB-year on a 13-node subnet, scaled by node count (V21). Blobs are kept in the EOP heap in a map keyed by (fileId, chunk).
- `wasm_memory_limit` is set in `canister.yaml`.

## Type model changes against spec §6

The spec's types stay, with these changes (full Motoko in `types.mo` during A2):

- `PartySnapshot = { name; orgNr : ?Text; vatNr : ?Text; address : Address; country; email : ?Text; peppolId : ?Text; personnummerEnc : ?Blob }` (C10).
- `CompanyProfile` (stored in `accounting`, C6). `CompanySnapshot` = `CompanyProfile` + `capturedAt`, with no `logoAssetPath` (C7).
- `SalesDoc`: `status : { #draft; #issued; #credited }` and no `paymentIds`/`deliveries`. `SalesDocView` adds the computed `paid`, `balance`, `overdue`, `payments`, `deliveries` (C8, C9). Quotes get their own `QuoteStatus`.
- `Voucher`: no `correctedBy`. `VoucherView` adds `correctedBy : [Nat]` from the index (C8).
- `Attachment`: no `linkedTo`, which moves to the link index. Adds `plainSha256 : Blob`, `cipherSha256 : Blob`, `wrappedKey : Blob`, `keyId : Text` (C16).
- `Obligation`: removed from state and computed in the browser (C19). New `Filing = { kind; period; filedAt; receiptRef : ?Text; by : Principal }` records completion.
- `Balances`: `Map<(Nat, Nat, Nat), Money>` keyed by (fiscalYearId, account, month), plus `VatTotals` keyed by (period, vatCode) (C18).
- `RoleAssignment = { principal; role : Role; addedAt; addedBy }`. Rule: at least one `#owner` is always kept.
- `TaxParameters` gains `validFrom` per rule, and the `employerFees` categories carry `birthYearFrom/To` and `capPerMonth`, so the youth reduction is pure data (V8).
- All dates are `Date = Text` validated as `YYYY-MM-DD` by `lib/Dates.mo`, which also does day arithmetic. `retainUntil` = 31 Dec of (fiscal-year end year + 7).

## Frontend plan (Ekonomi in the admin)

### Organising principle

The admin gets two **workspaces**: **Webbplats** (today's pages) and **Ekonomi** (accounting). A segmented switch at the top of the sidebar changes the navigation, so the website menu never mixes with twelve accounting sections. The switch appears only when the user has access to both. An accounting-only user signs in straight to Ekonomi. A site-only admin never sees it.

Inside Ekonomi the navigation follows **how often the work happens**, not the spec's list order:

```text
Ekonomi
  Översikt                      dashboard
  LÖPANDE
    Försäljning                 badge: förfallna fakturor
    Inköp                       badge: dokument att bokföra
    Bank & skattekonto          badge: omatchade transaktioner
    Bokföring
  PERIODER
    Moms                        badge: när deklaration förfaller inom 14 dagar
    Lön                         (hidden until enabled, D7)
    ROT/RUT                     (hidden until enabled)
    Bokslut
  REGISTER OCH ARKIV
    Tillgångar & lager          (lager hidden until enabled)
    Rapporter & export
  Inställningar
```

Role filtering: `#payroll` sees Översikt (payroll tiles only) and Lön. `#auditor` sees everything read-only, under a permanent "Läsläge" banner, with no create buttons. The UI hides what a role cannot do, and the canister still enforces it.

### Ekonomi shell (sticky top bar)

- Breadcrumb (Ekonomi › Försäljning › Faktura 2026-0042).
- **Fiscal year switch** ("2026 ▾" with a status chip: Öppet / Bokslut pågår / Låst). It sets the year for every list and report, and is kept in the URL (`?ar=2026`) so links are exact.
- **Search** (`Ctrl/⌘ K`): one box for voucher numbers, invoice numbers, customers, suppliers, amounts ("1 250" finds matching amounts) and pages.
- **"+ Ny"** menu: Faktura · Offert · Ladda upp kvitto/faktura · Verifikation · Lönekörning. It respects roles.
- **Deadlines bell**: count of items overdue or due within 7 days. It opens a panel that links to each obligation's flow.

### URL map (English paths, like the existing admin)

```text
/admin/accounting                         Översikt
/admin/accounting/setup                   first-run wizard
/admin/accounting/sales/invoices[/new|/:id]   …/quotes[/…]   …/payments   …/reminders
/admin/accounting/sales/customers[/:id]   …/items
/admin/accounting/purchases               inbox (att bokföra)   …/purchases/:id   …/suppliers[/:id]
/admin/accounting/bank                    transactions + matching   …/bank/import   …/bank/tax-account   …/bank/rules
/admin/accounting/ledger                  vouchers   …/ledger/new   …/ledger/:id
/admin/accounting/ledger/journal | general | trial-balance | accounts/:number
/admin/accounting/vat[/:id]               …/vat/ec-sales[/:id]
/admin/accounting/payroll                 pay runs   …/runs/:id   …/employees[/:id]   …/agi   …/vaxa
/admin/accounting/rot-rut[/:id]
/admin/accounting/assets                  …/assets/inventory
/admin/accounting/year-end
/admin/accounting/reports                 …/reports/audit (behandlingshistorik)
/admin/accounting/settings/:tab
```

Each route is its own module, which React Router splits automatically. `pdf-lib`, fonts and exporters load only when a file is generated.

### Page types (every page is one of these five)

1. **List page:** title + primary action, a tab row (sub-sections), a filter bar (status chips, period, search), then a **DataTable**. The DataTable has a sticky header, sortable columns with `aria-sort`, right-aligned tabular amounts, a row click that opens the detail, `j/k` + `Enter` navigation, cursor paging, and "Exportera vy (CSV)". Below `md` the rows become cards. Empty states give one sentence on what belongs there and the primary action.
2. **Document detail:** on the left, the rendered document (PDF preview, or a structured view of a voucher). On the right, a facts panel:
   - status timeline (Utkast → Utfärdad → Betald)
   - linked voucher chip
   - payments, attachments, deliveries
   - content hash (8 chars) with a verified ✓
   - the audit trail for that record
   Actions (Ladda ner PDF, Skriv ut, Registrera betalning, Kreditera, Rätta) sit in a header bar. Posted records show a lock chip: "Bokförd – kan inte ändras".
3. **Editor:** a form on the left and a sticky **totals panel** on the right (net per rate, VAT, rounding, total, and for vouchers debit/credit/difference). Drafts autosave to the canister ("Utkast sparat 14:02"). A validation summary at the top names the rule ("Köparens momsregistreringsnummer krävs vid omvänd betalningsskyldighet – ML 17 kap.") and links to the field. A preview toggle shows the real PDF.
4. **Guided flow (stepper):** for multi-step obligations (VAT return, pay run, ROT/RUT claim, year-end, setup, bank import). The steps are numbered, each shows done / current / blocked, and a step can be resumed later because the state lives in the canister. The irreversible step is always last and clearly marked.
5. **Workbench (split view):** for high-volume matching work. Inköp: the document on the left and the booking form on the right. Bank: unmatched transactions on the left and suggested matches on the right. `Enter` accepts and moves to the next item.

### Irreversible actions

Every post, issue, lock or file action opens a **confirm sheet** showing:
- what will be created ("Skapar verifikation F-2026-0123 (preliminärt nummer)")
- the debit/credit lines
- the date and the period it lands in, with a warning if the date is late (BFL booking timing) or close to the lock date
- the sentence "Kan inte ändras i efterhand – rättelser görs med en ny verifikation"

The button names the action ("Utfärda faktura"), not "OK". After success a toast links to the new record.

### Shared components (in `app/admin/accounting/ui/`)

| Component | Notes |
|---|---|
| `Money` / `MoneyInput` | Shows `1 234,56 kr` (`Intl` sv-SE). Input accepts `1234,56`, `1 234.56`, `-50`; stores öre; never uses floats. Amounts use `tabular-nums`. |
| `AccountPicker` | Combobox: type `19` or `bank` to get 1930 Företagskonto. Recent and favourite accounts first. Inactive accounts are hidden. Shows the VAT code hint. |
| `VatCodeSelect`, `PartyPicker` (with inline "+ Ny kund"), `ItemPicker`, `PeriodPicker`, `DatePicker` (sv format, week numbers) | |
| `DataTable`, `FilterBar`, `StatusChip` (one colour set for all statuses) | |
| `DocRef` | A chip like "F-2026-0123". Clicking opens a quick-view drawer from anywhere, and the drawer links to the full page. |
| `ConfirmPost` sheet, `Stepper`, `SplitView`, `DropZone` (whole-page drop + camera `capture` on mobile + per-file chunk progress), `PdfPreview` (iframe on a blob URL, worker-rendered), `HashBadge`, `ReadOnlyBanner`, `EmptyState` | |
| Reuse | Existing `Toast`, `card`/`btn` styles, the admin language switch, `useAdmin` session (extended with accounting roles) |

### Sections

- **Översikt:**
  - KPI tiles: bank balance (1930), receivables with overdue part, payables due within 7 days, estimated VAT for the open period, result so far this year.
  - A "Att göra" queue: documents to book, unmatched bank transactions, drafts older than 7 days, overdue invoices, missing backup owner, last backup more than 30 days ago.
  - The next 5 deadlines.
  - A monthly revenue/cost chart drawn as inline SVG (dataviz skill, no chart library).
- **Försäljning:** tabs Fakturor (credit notes are included, with a filter) · Offerter · Betalningar · Påminnelser · Kunder · Artiklar.
  - Invoice editor: customer first. That choice sets the language, terms, VAT treatment (domestic / EU reverse charge / export) and the required fields.
  - Lines with item lookup, totals panel, legal notes added automatically and shown read-only, OCR shown after issue.
  - "Konvertera offert till faktura" and "Kreditera" prefill the editor.
  - Reminders: a list of overdue invoices with the rule that applies (60 kr fee only when agreed; 450 kr compensation B2B, never both) and a bulk "Skapa påminnelser".
- **Inköp:** the inbox is the landing page.
  1. Drop or snap files.
  2. Each file becomes a card in "Att bokföra".
  3. Open a card in the workbench: supplier suggestion from earlier documents, default account from the supplier, VAT split, EU reverse charge toggle.
  4. "Bokför" posts it.
  Tabs: Att bokföra · Leverantörsfakturor (with payment status) · Kvitton & utlägg · Leverantörer.
- **Bank & skattekonto:**
  - Import: a CSV stepper (upload → map columns, remembered per bank → preview → import, with duplicate rows detected).
  - Matching workbench: suggestions by OCR, then amount + date, then rules. Rules are created from a match ("Bokför alltid 'Telia' på 6212").
  - Tax account tab: import plus a running balance against 1630.
- **Bokföring:**
  - The voucher list (series, number, date, text, amount, attachment icon).
  - The voucher editor has separate Debet / Kredit columns, not signed numbers, and a live difference that must be 0,00. Tab adds a row, and templates cover frequent postings.
  - Tabs: Verifikationer · Grundbok · Huvudbok · Saldobalans · Kontoanalys. "Rätta" on a posted voucher opens a prefilled reversal + replacement.
- **Moms:**
  - Period cards (period, due date, status: Öppen → Låst → Inlämnad → Betald).
  - Detail: boxes grouped as on Skatteverket's form. Each box drills down to its vouchers.
  - Stepper: Kontrollera (warnings: unbooked inbox items, unmatched bank, VAT accounts out of balance) → Lås period → Ladda ner fil / visa rutor → Markera inlämnad (receipt reference) → Bokför avräkning → Registrera betalning.
  - EU sales list: a tab with the same pattern.
- **Lön:**
  - Pay run stepper: Period → Underlag (hours, absence, benefits per employee in one grid) → Beräkna → Granska (payslip per employee, diff against last month) → Godkänn (posts) → Markera utbetald → AGI (download XML, mark filed) → Växa.
  - Employees: list + detail, with PII shown masked until "Visa" decrypts it (vetKey, `pii-v1`).
- **ROT/RUT:** cases with deadline countdowns (31 Jan). Stepper: Underlag → Köpare & fastighet (encrypted) → Skapa fil → Markera inskickad → Importera beslut.
- **Bokslut:** the year-end checklist from spec §3.6 as a stepper. Each step links to its section and turns green when its check passes. "Lås år" is only enabled when all steps pass.
- **Tillgångar & lager:** asset register with a depreciation schedule and a "Kör avskrivningar för period" action. Inventory: items, stock moves, a count sheet (printable, then entered).
- **Rapporter & export:**
  - A catalogue grid grouped by Bokföring, Kunder & leverantörer, Moms, Lön, Bokslut, Arkiv.
  - Each card: parameters (period, format), then "Skapa". It generates in the worker with a progress bar and saves a file.
  - Behandlingshistorik (audit log) and Systemdokumentation are here.
  - Full backup is here too, with passphrase entry and a strength meter.
- **Inställningar:** tabs Företag (legal profile with a live preview of the PDF header) · Bokföring (method, fiscal years, lock date, series) · Kontoplan · Momskoder · Fakturering (terms, OCR, reminders, template preview per version) · Lön (pay items, tax tables import) · Parametrar (TaxParameters per year with source URL; edits are audited) · Användare & roller · Säkerhet (vetKeys status, backup owner) · Moduler (D7 toggles).

### First-run setup wizard

This runs when `accounting` has no company profile. Steps:
1. Företag: pre-filled from the website contact info, plus the legal fields.
2. Räkenskapsår: first year up to 18 months.
3. Metod & momsperiod.
4. Kontoplan: BAS seed with a preview of the accounts.
5. Ingående balanser: manual entry or SIE4 import, from A9.
6. Bank: account mapping.
7. Roller: add a backup owner.
8. Checklista: report the storage location to Skatteverket (C22), and set up monthly backups.

You can stop and resume the wizard. The dashboard shows it until it is done.

### Quality bar (same as the website)

- axe WCAG 2.1 AA on every new page in both themes.
- Full keyboard use, with a `?` overlay that lists the shortcuts.
- Dialogs trap focus, and Escape closes them.
- Errors from the canister `Result` show as a toast plus inline field errors.
- No third-party requests.
- The CSP stays strict (C13).
- Bundle budget: each accounting route ≤ 60 kB gz, and the PDF worker loads on demand.

## Phase details

### A0. Plan and reconciliation — Done
- [x] Spec checked against RULES.md, the skills and the repo, with conflicts resolved above
- [x] Frontend information architecture and UX patterns
- [x] Your answers to D1–D8 (all recommendations approved)
- [x] `docs/accounting/sources.md` skeleton (filled per phase)

### A1. Repo restructure — Done
- [x] `git mv canisters/backend canisters/backend/site`, `canisters/frontend canisters/frontend/web`. Update the names in `canister.yaml`, `mops.toml`, `.did`, bindings, `icp.yaml` (`canisters/*/*`, environments), `scripts/deploy.sh`, the root `package.json`, tests, and `PUBLIC_CANISTER_ID:` lookups
- [x] pnpm workspace at `canisters/frontend/` (D6)
- [x] Local redeploy (the canister names change, so the local state is recreated). Re-seed with the deploy script. All existing `mops test` and Playwright tests pass.
- Result: `mops check` + 50 `mops test` pass; local deploy as `site`/`web`; 50/50 Playwright pass. pnpm 12.23.0 via corepack, lockfile imported from npm's (same versions). Local URL is now `http://web.local.localhost:8000`.

### A2. Ledger core (backend) — Done (2026-11-25)
- [x] `accounting` + `vault` scaffolds (`@dfinity/motoko` recipe, migrations chain, `deployed/*.most` baseline, `.did`)
- [x] Roles mixin (first owner install arg, ≥ 1 owner, anonymous rejected, mirror to vault)
- [x] Company profile, accounting settings, fiscal years (`#open/#closing/#locked`, lock date)
- [x] Seed: BAS accounts, VAT codes (box mapping pending V3), series. Documented in [seed.md](seed.md)
- [x] Numbering, drafts → post → correct, balances, audit hash chain (sha2), retention guard
- [x] Vault: chunked upload, MIME allow-list, size cap, hash check, append-only, role check
- [x] vetKeys endpoints (`docs-v1`, `pii-v1`) with role rules (D4)
- [x] `mops test`: balancing, gapless numbering, immutability, lock date, roles, retention, audit chain, canonical vectors
- Result: `mops check` passes for all three backends. `mops test`: accounting 26, vault 5, site 50. A local deploy of all four canisters works. `tests/api/accounting-api.spec.ts` passes 7/7 against the live canisters: roles, seed, gapless posting, correction links, drafts, vault mirror and upload, audit chain, and a vetKey derived and verified with `@icp-sdk/vetkeys`.
- Changes against this plan:
  - **D4:** `ic-vetkeys` was not added. The two management-canister calls (`vetkd_public_key`, `vetkd_derive_key`) are made directly in `lib/Keys.mo`, so there is one dependency fewer.
  - **vetKD key name:** pinned in state at first use (`config.vetkdKey`), per the vetkeys skill. A changed `VETKD_KEY_NAME` can never silently switch keys. Mainnet uses `key_1` (set in `icp.yaml`) and local uses `test_key_1`.
  - **Key derivations:** limited to 50 per principal per day and logged in the audit log.
  - **Attachments:** no `retainUntil` on the record. Retention follows the voucher, and nothing in accounting or the vault can be deleted at all.
  - **Not done yet:** `wasm_memory_limit` for the vault is moved to A10, where it is set from the subnet's limits.
  - **`acj-1` vectors:** live in `accounting/test/canonical.test.mo`. The TS test (A3) reads the canonical strings and hashes from that file.
  - **Frontend:** `@icp-sdk/vetkeys` added (D3), and bindings are generated for `accounting.did` and `vault.did`.

### A3. Ekonomi shell, UI kit, PDF pipeline, Bokföring UI — Done (2026-11-25)
- [x] Workspace switch, Ekonomi nav with role filtering, top bar (year, search, + Ny, deadlines)
- [x] UI kit components (table above), i18n files
- [x] PDF worker (`pdf-lib`, fonts), shared header/footer, `voucher@1`, `journal@1`, `ledger@1`, `trial-balance@1`
- [x] Setup wizard, Bokföring section, attachment upload with encryption
- [x] Deadlines engine (`deadlines.ts`, holidays) after V6
- [x] CSP additions for `admin.html` (C13)
- [x] Playwright: wizard → post voucher → PDF shows the header → correction voucher; axe; read-only auditor
- Result: `mops test` site 50, accounting 27 (new `auditFor` test), vault 5. Full Playwright 74/74, then the Ekonomi e2e again after the last fixes (2/2). Unit tests (`tests/unit/`): acj-1 parity with the Motoko vectors, deadlines against Skatteverket's 2026 AGI tables (both turnover classes), PDF header/footer content, page breaks and byte-reproducible output per template. E2E (`tests/e2e/accounting.spec.ts`): an accounting-only owner signs in through local II, runs the wizard, posts a voucher, checks the PDF header and the audit hash, uploads an encrypted document and opens it decrypted, posts a correction; an auditor gets the read-only view; axe passes on every page.
- Changes against this plan:
  - **Sections shown:** Översikt, Bokföring and Inställningar only. The other sections appear in the nav when their phase ships, so there are no dead links.
  - **i18n:** one Ekonomi dictionary (`app/admin/accounting/i18n/{sv,en}.ts`) instead of one file per section. It is about 8 kB gzipped; split per section when A4+ grow it.
  - **PDF text layout:** pdf-lib is given a cmap-only glyph lookup instead of fontkit's OpenType shaping, which cost about 100 ms per text run with Inter. No ligatures or kerning are applied, so copied text is exact. The worker is 508 kB gzipped (mostly fontkit) and loads only when a PDF is made.
  - **Template fingerprints:** `tests/unit/pdf.spec.ts` pins a SHA-256 per template version for fixed test data, so a published template cannot change silently; a layout change needs a new version.
  - **Backend addition:** `auditFor(entity, id)` query, so a voucher page can show its own audit trail and check its content hash (acj-1, the same bytes as the audit entry's `detailHash`).
  - **Setup steps 5–6** (opening balances, bank mapping) show what to do now and are marked "later": SIE4 import is A9, bank import A5.
  - **Deadlines:** turnover ≤ 40 MSEK is assumed until A6 adds turnover and EU trade settings. Yearly VAT uses the earliest (EU trade) date until then. Preliminary tax shows the 12th (the only day Skatteverket's page states).
  - **Opening a stored document** shows it in a preview dialog (with download) instead of a new tab, which browsers block after an async decrypt. `admin.html` also gets `img-src blob:` for image documents.
  - **Brand script:** fixed the logo path broken by A1, and added `pdf/logo@1.png` (C7).

### A4. Sales — Done (2026-11-25)
Sources checked first (V1, V2, V13, V14, V18; see sources.md).
- [x] Seed `seed-2026.2`: add BAS 3305, 3308, 3990, 8313 (names verbatim from BAS 2026 v1.1); sales accounts on the export/EU VAT codes
- [x] Parameters (owner-edited, audited, with source URL): reference rates per half-year, reminder fee 60 kr, förseningsersättning 450 kr, simplified-invoice limit 4 000 kr
- [x] Customers and items (`#company`/`#private`, VAT nr, terms, language, `reminderFeeAgreed`)
- [x] Quotes (own numbering; draft → sent → accepted/declined/expired; convert to invoice)
- [x] Invoices: draft → issue in one synchronous update: validate ML 17:24–29 and ABL 28:5, allocate the invoice number (gapless, one series for invoices and credit notes), freeze the snapshot, hash it (acj-1), post the voucher (invoice method) in series F
- [x] Legal notes from the VAT treatment: "Omvänd betalningsskyldighet", EU goods exemption (10 kap. 42 § ML), export exemption, "Godkänd för F-skatt"; VAT in SEK for other currencies (ML 17:29)
- [x] OCR reference: invoice number + optional length digit + Luhn check digit
- [x] Credit notes: reference the original's number (ML 17:28 5), full or partial, post the reversal
- [x] Payments: register against an invoice (1930 / 1510; cash method books revenue and VAT at payment), balance and overdue computed (C9)
- [x] Reminders: documents with the fee only if agreed, or 450 kr B2B instead (never both, 1981:739 5 §), and interest = reference rate + 8 pp from the due date (Räntelagen 3, 6 §§)
- [x] PDF `invoice@1` (sv/en), `credit-note@1`, `quote@1`, `reminder@1` from the stored snapshot; hash verified on every render
- [x] Peppol BIS Billing 3.0 UBL export (Invoice/CreditNote), checked against the UBL 2.1 XSD (xmllint-wasm, D5) and the Swedish SE-R rules in unit tests
- [x] Försäljning UI: Fakturor · Offerter · Betalningar · Påminnelser · Kunder · Artiklar; invoice editor customer-first with totals panel
- [x] Tests: `mops test` (totals and VAT rounding, mandatory fields per treatment, gapless invoice numbers, OCR Luhn, interest and fee rules); Playwright: issue invoice → PDF header from settings → change settings → old invoice PDF still shows the old snapshot with the identical hash
- Result: `mops test` accounting 43 (16 new for sales); `tests/api/sales-api.spec.ts` 5/5 against the live canister (gapless invoice numbers, snapshot hash in the browser equals the canister's and the audit entry's, F/B vouchers, partial credit, payment, quote → invoice, EU reverse charge needs the buyer's VAT nr); unit tests for the four new templates (content + pinned fingerprints) and Peppol (valid against the UBL 2.1 XSDs, SE-R checks, a broken document is rejected); `tests/e2e/sales.spec.ts`: the acceptance flow (issue → PDF header from settings → settings changed → same PDF content and hash), e-invoice, payment, axe on every sales page.
- Changes against this plan:
  - **Parameters** are seeded from the verified sources and can be changed by an owner through `setParameters` (audited, with a source). The Inställningar › Parametrar form comes with A7, which adds the payroll parameters to the same tab.
  - **Simplified invoices** are not issued; every invoice has full ML 17:24 content. The 4 000 kr limit is stored for later use.
  - **Interest and fees** on reminders are claimed on the reminder and booked only when received (Bokför betalning › "Varav ränta/avgifter", to 8313 and 3990).
  - **Cash method:** revenue and VAT are booked pro rata at payment; credit notes are not booked under the cash method (refunds come with bank in A5). Unpaid invoices at year-end are booked in A9.
  - **Peppol:** checked against the UBL 2.1 XSDs and the Swedish rules we can test; the Peppol Schematron needs an XSLT 2 engine and was not run. Sending through an access point is out of scope (download only).
  - **Tax category mapping** (EN 16931): domestic S, EU goods K, EU services and domestic reverse charge AE, export goods G, services outside the EU O, exempt E.
  - **New BAS accounts** in seed `seed-2026.2`: 3990, 7960, 8313 (names verbatim from BAS 2026 v1.1).
  - **Migrations:** a second pending migration adds the sales state; `check-limit` is 2 until mainnet.

### A5. Purchases, bank, tax account — Done (2026-11-25)
Sources checked first (V22–V24; see sources.md).
- [x] Seed `seed-2026.3`: BAS 2624, 2634, 2820, 4415–4417, 4425–4427, 4516, 4517, 4532, 4533, 4536, 4537, 8314, 8423 (names verbatim from BAS 2026 v1.1)
- [x] Suppliers (name, org nr, VAT nr, country, bankgiro/plusgiro/IBAN/BIC, default account, default VAT treatment) under Parties
- [x] Inbox: uploaded attachments not yet used by a voucher or purchase are "Att bokföra"; a file can be dismissed only by linking it, never deleted (BFL 7 kap.)
- [x] Purchase documents: supplier invoice, supplier credit note, receipt (paid by company card/bank or cash), expense claim (paid privately, owed to the person on 2820). Each references its original file (ML 13:32 evidence)
- [x] VAT treatment per document: domestic (input VAT as stated, 2641), EU goods (4515–4517, ML 16:17), EU services and non-EU services (4535–4537 / 4531–4533, ML 16:9), domestic reverse charge goods/services (4415–4417 / 4425–4427, ML 16:6, 13–16), no VAT. Reverse charge: output VAT on 2614/2624/2634 and the same amount as input VAT on 2645 (foreign) or 2647 (domestic). Foreign VAT is never deducted (part of the cost)
- [x] Booking in series L (2440 for invoices, 1930/1910 for receipts, 2820 for expense claims); currency at the document's rate. Cash method: supplier invoices are booked at payment
- [x] Supplier payments in series B (2440 / 1930, exchange differences on 3960/7960) and expense-claim payouts (2820 / 1930)
- [x] Bank accounts (name, ledger account, bank); CSV import stepper: upload → map columns (remembered per bank account) → preview → import; duplicates (same date, amount, text, reference) are skipped
- [x] Matching: suggestions by OCR against open invoices, then amount ± date window against open invoices and supplier invoices, then rules ("text contains X → account Y"); accept posts a B voucher and links the transaction; "already booked" links it to an existing voucher on the bank account
- [x] Tax account: the same CSV stepper and manual entry (the e-service only offers a printout, V24). Kind per entry; booking against 1630: VAT 2650, employer return 2710/2731, preliminary tax 2518, interest income 8314 (tax-free), interest cost 8423 (not deductible), payments matched to the bank voucher; running balance compared with 1630
- [x] Inköp UI: Att bokföra (inbox + workbench with the file beside the form) · Leverantörsfakturor · Kvitton & utlägg · Leverantörer. Bank & skattekonto UI: Transaktioner (workbench) · Import · Regler · Skattekonto
- [x] Tests: `mops test` (reverse charge postings per treatment, foreign VAT not deducted, gapless L series, duplicate import, OCR/amount/rule suggestions, tax-account postings); Playwright: upload → book → bank CSV import → match → balances
- Result: `mops test` accounting 59 (16 new: postings per VAT treatment incl. Skatteverket's 55 000 kr EU example, foreign VAT not deductible, evidence required, FX and cash-method payments with the reverse-charge pair kept equal, OCR/amount/rule suggestions, duplicate keys, tax-account accounts); `tests/api/purchases-api.spec.ts` 4/4 against the live canister (inbox → L voucher with the file, file cannot be reused, EU services 2645/2614 and a supplier credit note, bank import with duplicates skipped, OCR/amount/rule matches as B vouchers, tax-account VAT and interest against 1630 and the deposit linked to the bank voucher); `tests/unit/purchases.spec.ts` (booking preview equals the canister's lines, CSV parsing); `tests/e2e/purchases.spec.ts`: upload → book beside the decrypted file → bank CSV twice (second time all duplicates) → accept the amount match → invoice paid, axe on every Inköp and Bank page.
- Changes against this plan:
  - **Tax account import:** Skatteverket's e-service has no file export (V24), so the user copies the transactions to a CSV (same column stepper as the bank) or adds them one by one. The kind is guessed from the text and shown for review in the preview; it can be changed until the entry is booked. Tax-account vouchers use series B.
  - **Import VAT** (boxes 50, 60–62, 13:35 import document) is not handled; imports are booked as "Ingen avdragsgill moms" until A6 adds it.
  - **Bank accounts:** the migration creates "Företagskonto" on 1930. More accounts can be added through the API (`saveBankAccount`, BAS class 19 only); the form comes with setup step 6 (bank mapping).
  - **Matching window:** an amount match must be within ±10 days of the due date (a working choice, not a legal rule). Bank rules split included VAT to 2641 only.
  - **Expense claims** name the person in free text and are owed on 2820; they link to employees when payroll arrives (A7).
  - **Cash method:** supplier invoices are registered at booking and booked pro rata at payment, with the file attached to the payment voucher; supplier credit notes are registered but not booked (as for sales).
  - **Inbox:** a file leaves "Att bokföra" only when it is used as evidence (on a purchase, a voucher or linked to one); it can never be deleted.
  - **VAT codes:** no new codes; the reverse-charge rates 12 % and 6 % post to 2624/2634 and get their box mapping in A6.
  - **Migrations:** a third pending migration adds purchases and bank; `check-limit` is 3 until mainnet.

### A6. VAT and EU sales list — Done (2026-11-25)
- [x] V3, V4, V5 verified and recorded (box list and file layout, EU sales list file, VIES API and IPv6)
- [x] Box mapping in [vat-boxes.md](vat-boxes.md): boxes come from the ledger through VAT codes (account → VAT code → box), so manual vouchers count too. Seed `seed-2026.4`: VAT codes get their boxes; base codes for purchase accounts (20–24) and 3231 (41); input VAT codes for 2640/2645/2647 (48); import 2615/2625/2635 (60–62). Accounts 2625, 2635, 3231, 4545–4547 added (names verbatim from BAS 2026). Empty box/VAT-code fields left by the earlier seeds are filled; edited values are kept
- [x] Import VAT (13:35): purchase treatment "Import (tullräkning)": the tax base per rate from the tullräkning, booked Dr 2645 / Cr 2615–2635 (nothing payable), box 50 from those bases; dated when the tullräkning was issued
- [x] Return per period (month/quarter/year from settings): live preview with checks (unbooked inbox, unmatched bank rows, revenue accounts without VAT code, EU sales list vs boxes 35/39, earlier period not filed)
- [x] Lock and settle in one step: box values (whole kronor, öre dropped) and the source voucher hash stored, settlement voucher in series M (26xx → 2650, öre to 3740) dated the period end, lock date moved to the period end
- [x] eSKDUpload 6.0 XML (ISO-8859-1) and a PDF report; mark filed (receipt reference); link the tax-account VAT entry as paid
- [x] EU sales list: rows per buyer VAT nr from issued invoices/credit notes (goods EUVA, services EUTJ, SEK, whole kronor), month or quarter, SKV574008 file, mark filed
- [x] VIES check from the customer dialog (HTTPS outcall, non-replicated, result and time stored per VAT nr)
- [x] Tests: `mops test` box fixtures (Skatteverket's import and EU examples, domestic, reverse charge, credit notes, öre), settlement balances, lock, EU sales list rows; unit tests for the XML and SKV574008 files; Playwright stepper + axe
- Result: `mops test` accounting 74 (15 new: Skatteverket's EU goods 55 000 kr and import 100 000 kr examples, öre dropped per box, 49 from the whole-kronor boxes, settlement balanced with öre on 3740, refund and nil periods, period rules, EU sales list period codes, VIES request and answer parsing, the import document). `tests/unit/vat.spec.ts` checks the XML against Skatteverket's example 4 and the SKV574008 file against its example 1 line by line. `tests/api/vat-api.spec.ts` locks a real period on the local canister (series M settlement, lock date, filed, tax-account payment linked) and checks EU sales list rows. `tests/e2e/vat.spec.ts` covers the pages, the XML download and axe. VIES was called once from the local canister (non-replicated outcall) and answered.
- Deviations and notes:
  - **Lock and settle are one step** (spec: lock → file → mark filed → settle). The lock date blocks every posting in the period, so the settlement is posted in the same update, dated the period end.
  - **Öre:** current Skatteverket pages only say "whole kronor". Öre are dropped per box (truncated) and booked to 3740. Open until confirmed (V3).
  - **No XSD:** Skatteverket publishes no XSD or DTD for eSKDUpload 6.0 on the page, so the file is checked against the documented layout and examples instead (C14 partly). The real check is the upload in the e-service, which needs your e-legitimation: please upload the XML for the locked period once and save it without signing. The same goes for the EU sales list in Filöverföring › Testa filer (no e-legitimation needed).
  - **Corrections after filing** are not supported: Skatteverket wants the whole return again, and the period is locked. Errors found later are corrected in an open period.
  - **EU sales list** uses the invoice date (box 35/39 follow the voucher date; the check flags a difference, e.g. under the cash method). Triangulation (37/38) and call-off stock are not supported. Quarterly reporting is a choice on the page; goods then show Skatteverket's "Medgivande krävs" note.
  - **Import VAT** comes from the tullräkning as its own document (Dr 2645 / Cr 2615–2635, nothing payable). BAS 2026 has no neutral 459x account, so the base is not booked; box 50 comes from the documents.
  - **VIES** uses one node (`is_replicated = false`): VIES limits concurrent calls and the answer is advisory. At most 200 checks a day. Cycles are attached with `costHttpRequest` (pricing version 1, no new dependency).
  - **Candid:** `Treatment` gained `#importVat`, so the local deploy needed `--yes` for the Candid check (stable compatibility passed; the only client is this frontend).
  - **Settings:** EU trade and turnover over 40 MSEK are still not settings; yearly VAT and deadlines keep the earliest date.


### A7. Payroll, AGI, växa — Done (2026-11-26), commit 587fef1
- [x] V7–V11 verified and recorded (AGI 1.1.18.2 and XSDs, fee categories incl. the youth reduction from April 2026, växa-stöd as a refund, tax tables 2026 file format, amounts 2026, semesterlagen)
- [x] Payroll parameters as dated data (fee rates and birth-year categories, youth reduction window and cap, 1 000 kr threshold, växa caps, 12 % / 0,43 %, mileage, per diem, kostförmån, PBB) with source; owner can change them (Inställningar › Lön)
- [x] Seed `seed-2026.5`: BAS payroll accounts 7210, 7220, 7281, 7285, 7290, 7321, 7331, 7512, 7519, 2941 (2710, 2731, 2820, 2920, 7510 exist) and pay items (lönearter) with AGI field codes
- [x] Employees: plaintext name, birth year, employment dates, pay, tax table/column or flat %, vacation rule, owner/related flag, växa start; personnummer, address and bank account encrypted in the browser with `pii-v1`
- [x] Tax tables: import the tables in use from Skatteverket's monthly file (fixed width, parsed in the browser), stored with the file hash
- [x] Pay runs: period and payment date, lines per employee, calculation in `accounting` (tax by table/column or %, fee category by birth year and period, youth split at 25 000 kr, vacation accrual by procentregeln), review, approve (series P: salaries, tax 2710, fees 7510/7512 → 2731, net pay → 2820, vacation 7290/2920 and 7519/2941), mark paid (2820 → 1930)
- [x] Payslip PDF (payslip@1) with what the AGI reports
- [x] AGI per period: HU (487, 497) and IU per employee (215, 570, 011, 012, 013, 001, 050, 051 …) built in the browser from the approved runs, XML validated against the official XSD in unit tests; mark filed
- [x] Växa-stöd: eligibility checks and a refund application record per employee and month (after the AGI is filed), with a summary PDF
- [x] Tests: `mops test` fee categories (incl. someone born 2005 paid in May 2026 → 20,81 % up to 25 000), tax lookups, postings; unit tests for the tax-table parser and the AGI XML against the XSD and Skatteverket's example 15; Playwright pay run + axe
- Result: Playwright 120/120 (this test file rerun after a fix). `mops test` accounting 84 (10 new):
  - fee categories, including the spec case (born 2005, paid May 2026: 20.81 % up to 25 000 kr);
  - tax-table lookups with real 2026 rows;
  - a payslip and its balanced voucher;
  - AGI sums matching Skatteverket's example 15 (487 = 18 881, 497 = 28 140);
  - växa-stöd (Skatteverket's 7 423 kr example).

  Other tests:
  - `tests/unit/payroll.spec.ts` parses Skatteverket's 2026 monthly file (tables 29–42). It validates the AGI XML against the official XSD 1.1 and matches example 15 field by field.
  - `tests/api/payroll-api.spec.ts` runs a full pay run on the local canister (youth and pension rates, P and B vouchers, AGI return, XML vs XSD, filed).
  - `tests/e2e/payroll.spec.ts` covers employee encryption, the pay run, the payslip PDF and axe.
- Deviations and notes:
  - **Your manual check:** upload one AGI file in Skatteverket's test service (no login needed) and note the result in sources.md.
  - **Not calculated:** sick pay and karensavdrag are entered as lines (no sjuklönelag calculator, not verified). The car-benefit value is entered, because Skatteverket's page gives only a worked example and no formula. Sammalöneregeln has no accrual; semestertillägg is entered as a line.
  - **Open legal points:**
    - SKV 433 does not say how the percentage rows are rounded; truncation to whole kronor is assumed.
    - The 1 000 kr yearly threshold is stored but not applied automatically. Set "Inget skatteavdrag" for such payees.
    - A travel-cost law change from 1 July 2026 is mentioned in the open-data catalog; the amounts page shows no change.
    - The SFS number of the youth reduction law was not found (prop. 2025/26:66).
  - **AGI scope:**
    - No frånvarouppgift (absence records), corrections or removals.
    - A return uses up its period. A pay run in a period with a return can no longer be approved.
    - The period is the payment month, and the tax table year is the payment year.
  - **Växa-stöd:** the employer sets "växa-stöd från" after checking the conditions. The canister checks the rest: not an owner or related person, within 24 months, AGI filed, full fee category. De minimis is not tracked.
  - **Postings:** benefits are not booked (they only drive tax and contributions); contributions all go to 7510 (7512 is seeded but unused).
  - **Personal data:** personnummer, address and bank account use `pii-v1`, so the auditor sees runs and returns but not the decrypted data.
  - **Not done:** expense claims are not linked to employees yet.
  - **Local test data:** the API test approved and paid runs and filed the AGI for periods 202612 and 202610 (each period can be used once). Older e2e runs left draft pay runs in 202611 on the local canister.


### A8. ROT/RUT — Done (2026-11-26), awaiting your sign-off
- [x] V12 verified and recorded (2026 rates and caps, XML 1.0 and 1.1 schemas with examples, decision JSON schema, 2027 fields, SKV 4542 field meanings, BAS 1513)
- [x] Parameters as dated data (ROT 30 %, RUT 50 %, caps 50 000 / 75 000 kr, XML 1.1 from 2027-01-01) with source; owner can change them (ROT/RUT › Inställningar)
- [x] Invoice part: ROT or RUT on a SEK invoice (or quote) to a private customer. Each line is marked labour (with work type), material (with work type) or other. Buyers with shares; name + personnummer and the property (fastighetsbeteckning, or BRF org. nr + lägenhetsnummer) encrypted in the browser with `pii-v1` (bookkeeper now gets `pii-v1`, as C16 says)
- [x] The canister computes the deduction: at most the rate × labour incl. VAT, truncated to whole kronor, split by share; each buyer's part within the caps. "Att betala" = total − deduction. Posting: 1510 the customer's part, 1513 the deduction (seed `seed-2026.6` adds 1513)
- [x] Credit notes of a ROT/RUT invoice: full credit only, before any case exists
- [x] Cases: one per claimed set of payments (same share of the deduction as the share paid, cumulative so rounding never adds up), electronic payments only, one payment year, whole hours per work type, subcontractors / staffing agency (2027), deadline 31 Jan of the year after payment (also in the deadline list)
- [x] Claims (begäran): one type and one payment year, up to 100 buyers, unique name; XML built in the browser (1.0, or 1.1 from 2027 with the confirmation), validated against both XSDs in tests; mark submitted
- [x] Decision import: Skatteverket's decision JSON matched in the browser on invoice number + personnummer (claim name when an invoice has several open cases), plus manual entry; payout voucher in series B (bank against 1513); a refused amount moves to the customer (1513 → 1510) and reopens the invoice balance. Cash method: the payout is booked pro rata to revenue and VAT
- [x] UI: ROT/RUT section (hidden until enabled): ready invoices and cases with deadline countdown, claim stepper Underlag → Köpare & fastighet → Skapa fil → Markera inskickad → Importera beslut; parameters; invoice editor section; invoice page and PDF show the deduction, buyers and property
- [x] Tests: `mops test` caps, splits, partial payment, postings, rules; unit tests XML vs both XSDs and Skatteverket's examples, decision JSON parsing and matching; API test of the whole flow; Playwright invoice with RUT → PDF → payment → case → claim → XML + axe
- Result: `mops test` site 50, accounting 94 (9 new in `rotrut.test.mo`), vault 5. Playwright 128/128, then the deadline change rerun (7/7).
- Deviations and open points:
  - Rounding of the deduction to whole kronor is not stated by Skatteverket; the app truncates (never above the maximum share).
  - Several buyers on one invoice: labour, paid amount, material, other costs and hours are split by share in the XML (whole kronor and hours, the first buyer takes the remainder). Not stated by Skatteverket; check in the e-service.
  - The yearly cap per person is checked only within one invoice. The buyer's remaining deduction comes from Skatteverket's "Mina skattereduktioner"; use "Lägre avdrag" on the invoice when less is left.
  - Buyer ≥ 18 in the payment year and a valid personnummer are checked in the browser when the file is built (the canister never sees personnummer). "Buyer ≠ performer" and the family rules are not checked.
  - A decision file lists a claim and its payouts separately; the app sums the approved amounts per case. Check against your first real decision file.
  - Utförare in the XML is "16" + organisationsnummer (the 12-digit form of the decision file).
  - Grön teknik (also in the schema) is not included.
  - Your manual check: import one generated XML file in "Rot och rut – företag" (before submitting) to confirm it is accepted.

### A9. Assets, inventory, year-end, SRU, SIE4, backup — In progress (started 2026-11-26)
Scope as in spec §13 phase 7, with the UI from "Sections" above. A9 is large, so it is done in three parts, with a local deploy, tests and your sign-off after each part. Each part starts with its V-items.

**A9a. Tillgångar & lager**
- [x] V25 verified and recorded: small-equipment limit (half PBB), depreciation of machinery and equipment (räkenskapsenlig avskrivning: 30 % main rule, 20 % supplementary rule, restvärdesavskrivning), K2 rules for fixed assets (BFNAR 2016:10), BAS accounts for assets, accumulated depreciation and disposals
- [x] V26 verified and recorded: inventory valuation (lowest-value principle, 97 % schablon, FIFO), K2 rules for inventory, BAS accounts 1460 / 4960
- [x] Asset register: cost account (1220/1221/1224 …), accumulated depreciation and expense accounts, cost excl. deductible VAT, residual, life in months (60 = K2 10.27), opening depreciation for assets from earlier years, link to the purchase; editable until the first depreciation; half-PBB hint (K2 10.5) from the stored PBB
- [x] Depreciation run for a period (own series I "Inventarier och lager"): straight line per month from the month taken into use, truncated to öre, the last month takes the remainder; one voucher per run (one line pair per account pair); each period once; a skipped month is caught up; blocked by the lock date and locked years
- [x] Disposal: cost and accumulated depreciation removed; paid to an account → gain 3973 / loss 7973 net; invoiced on 3973 → book value set off against 3973 (loss part 7973); scrapped → 7973 (K2 7.13, 7.14)
- [x] Inventory (periodic method): stock items (optionally linked to a sales item), moves (purchase, sale, adjustment, return), FIFO value of what is left (IL 17:3), a count on the last day of a month with NRV per item (lowest value, K2 12.4) and the optional 97 % rule (IL 17:4, K2 12.5); quantity differences become count moves; the change of stock is booked 1460 against 4960 (BAS has no 4990); moves on or before the last count or the lock date are frozen
- [x] Lager hidden until enabled (D7); the asset register is always there for bookkeepers
- [x] UI: Tillgångar & lager (register, schedule per financial year, "Kör avskrivningar för period", disposal, stock items and moves, count sheet), PDF + CSV for the register, schedule, inventory list and count sheet
- [x] Tests: `mops test` (20 new in `assets.test.mo`), unit (`assets.spec.ts`: the browser plan equals the canister's), API test, Playwright + axe
- Deviations and open points:
  - Stock moves are entered by hand; they are not created from purchases or sales invoices yet.
  - Depreciation is the book (K2) plan only. Tax depreciation above plan (överavskrivning, 30/20 % rules) is a year-end appropriation in A9b.
  - Until opening balances exist (A9b), the stock account balance at a count is the sum of all postings on the account.

**A9b. Bokslut, K2, SRU**
- [ ] V15 (BAS → SRU for INK2R/INK2S), V16 (SRU file format), V19 (K2 layout), corporate tax 20.6 % and periodiseringsfond 25 % verified and recorded
- [ ] Year-end stepper (spec §3.6): inventory count → depreciation run → accruals/prepayments → reconcile bank, tax account, VAT, payroll liabilities → unpaid invoices under the cash method → tax calculation → appropriations → closing vouchers → lock year → opening balances for the next year
- [ ] Income statement and balance sheet in K2 layout (PDF); INK2R/INK2S data; `INFO.SRU` + `BLANKETTER.SRU`; INK2, AGM and annual report deadlines
- [ ] Tests: `mops test`; SRU file against the format description; Playwright + axe

**A9c. SIE4, backup, system documentation, dashboard**
- [ ] V17 (SIE 4C) and V20 (BFNAR 2013:2 open part: systemdokumentation, behandlingshistorik) verified and recorded
- [ ] SIE4 export at any time; SIE4 import of opening balances in the setup wizard; round-trip test
- [ ] Full backup: ZIP (JSON + SIE4 + decrypted vault files + manifest with hashes), passphrase-encrypted, strength meter; restore into a fresh local network (tested)
- [ ] Rapporter & export catalogue, Behandlingshistorik and Systemdokumentation PDFs
- [ ] Översikt dashboard: KPI tiles, "Att göra" queue, next 5 deadlines, monthly revenue/cost chart
- [ ] Tests: SIE4 round trip, restore test, Playwright + axe

### A10. Mainnet — Not started (approval at every step)
- [ ] V21 + C22 legal review done
- [ ] Create `accounting`, `vault` (and the website canisters, if not yet on mainnet) on the chosen subnet with `icp canister create … -e ic --subnet <id>`
- [ ] First owner, backup owner, first backup

## Risks

| Risk | Handling |
|---|---|
| Legal formats change during the build | Templates and exporters are versioned. Each V-item records its retrieval date. Re-check before each filing season. |
| Key loss makes encrypted records unreadable | Envelope keys, two owners, and monthly passphrase backups with decrypted content (C16) |
| A wrong posting is permanent | Confirm sheets, drafts, and correction vouchers. Lock dates stop back-dating. |
| Scope: this is a full accounting system | The phase gates stand. Each phase is usable on its own (A3 is already a working ledger). |
| Storage-location rules (C22) | Legal review before mainnet. The Sweden backup is the fallback. |

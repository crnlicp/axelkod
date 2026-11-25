# Accounting module: build plan

Spec: [../axelkod-accounting-spec.md](../axelkod-accounting-spec.md). Source of truth for tooling and layout: `~/.claude/icp/RULES.md` plus the ICP skills. Where this plan and the spec disagree, the plan applies (see "Conflicts and resolutions").

Status values: `Not started` · `In progress` · `Blocked` · `Done`.
Each phase ends with a local deploy, that phase's checks, and your sign-off. Mainnet steps need your explicit approval each time.

## Phase overview

| # | Phase | Status | Verified by |
|---|---|---|---|
| A0 | Plan, spec reconciliation, decisions | Done (2026-11-25) | Your sign-off |
| A1 | Repo restructure to grouped layout | Done (2026-11-25, branch `accounting`) | Local deploy, all existing tests pass unchanged |
| A2 | Ledger core (backend): roles, settings, fiscal years, BAS, numbering, vouchers, audit, vault | Done (2026-11-25), awaiting sign-off | `mops test` both canisters |
| A3 | Ekonomi shell + UI kit + PDF pipeline + setup wizard + Bokföring UI | Not started | Playwright, axe, PDF snapshot test |
| A4 | Sales | Not started | `mops test` + Playwright (hash-stable re-render) |
| A5 | Purchases, bank, tax account | Not started | `mops test` + Playwright upload/match |
| A6 | VAT and EU sales list | Not started | Box fixtures, file checked in Skatteverket's test service |
| A7 | Payroll, AGI, växa | Not started | Fee-category tests, AGI XML vs XSD, test service |
| A8 | ROT/RUT | Not started | Cap tests, XML vs schema |
| A9 | Assets, inventory, year-end, SRU, SIE4, backup | Not started | SIE4 round trip, restore test |
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
| V1 | Mandatory invoice content | Mervärdesskattelag (2023:200) 17 kap. (riksdagen.se), Skatteverket "Fakturering" pages | A4 | Not started |
| V2 | Simplified invoice limit, foreign-currency VAT in SEK wording | ML 17 kap., Skatteverket | A4 | Not started |
| V3 | VAT return box list, file format, whether file upload still exists | Skatteverket "Fylla i momsdeklarationen" + technical description for file submission | A6 | Not started |
| V4 | EU sales list file format and deadlines | Skatteverket "Periodisk sammanställning" + Filöverföring format description | A6 | Not started |
| V5 | VIES REST API, and whether IC HTTPS outcalls can reach it (IPv4/IPv6) | ec.europa.eu VIES technical info, `https-outcalls` skill | A6 | Not started |
| V6 | VAT and AGI deadlines including the 17th exceptions; prepaid tax dates | Skatteverket "Deklarations- och betalningsdagar" | A3 (deadlines) | Not started |
| V7 | AGI XML schema and current document version, field codes | Skatteverket developer portal (Utvecklarportalen): Arbetsgivardeklaration teknisk beskrivning + XSD | A7 | Not started |
| V8 | Employer contribution rates 2026, youth reduction dates, rate and birth years | Skatteverket "Arbetsgivaravgifter" + the enacted law (SFS) | A7 | Not started |
| V9 | Växa-stöd as a refund application from 2026 | Skatteverket "Växa-stöd" | A7 | Not started |
| V10 | Tax tables open-data format | Skatteverket open data (Skattetabeller) | A7 | Not started |
| V11 | Mileage, per diem, PBB/IBB 2026, car benefit formula | Skatteverket "Belopp och procent 2026" | A7 | Not started |
| V12 | ROT/RUT 2026 rates and caps, XML schema, decision JSON, 2027 fields | Skatteverket "Rot och rut – företag" technical description | A8 | Not started |
| V13 | Riksbank reference rate history | riksbank.se (referensränta) | A4 | Not started |
| V14 | Late-payment compensation and reminder-fee rules | Räntelagen (1975:635), Lag (1981:739) om ersättning för inkassokostnader | A4 | Not started |
| V15 | BAS 2026 accounts and BAS → SRU (INK2R/INK2S) mapping | bas.se, Skatteverket SRU technical description (INK2) | A2 / A9 | Accounts done (A2); SRU open |
| V16 | SRU file format (`INFO.SRU`, `BLANKETTER.SRU`) | Skatteverket "SKV 269" technical description | A9 | Not started |
| V17 | SIE 4C (type 4) spec | sie.se file format description | A9 | Not started |
| V18 | Peppol BIS Billing 3.0 rules and UBL schema | docs.peppol.eu/poacc/billing/3.0/ | A4 | Not started |
| V19 | K2 layout (BFNAR 2016:10) for income statement and balance sheet | bfn.se | A9 | Not started |
| V20 | Bookkeeping, retention and storage rules (BFL 1999:1078, BFNAR 2013:2, 7 kap. storage abroad) | riksdagen.se, bfn.se | A2 | BFL done; BFNAR 2013:2 open |
| V21 | European subnet ID, node count and node countries | ICP dashboard | A10 | Not started |

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

### A2. Ledger core (backend) — Done (2026-11-25), awaiting your sign-off
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

### A3. Ekonomi shell, UI kit, PDF pipeline, Bokföring UI — Not started
- [ ] Workspace switch, Ekonomi nav with role filtering and module toggles, top bar (year, search, + Ny, deadlines)
- [ ] UI kit components (table above), i18n files per section
- [ ] PDF worker (`pdf-lib`, fonts), shared header/footer, `voucher@1`, `journal@1`, `ledger@1`, `trial-balance@1`
- [ ] Setup wizard, Bokföring section, attachment upload with encryption
- [ ] Deadlines engine (`deadlines.ts`, holidays) after V6
- [ ] CSP additions for `admin.html` (C13)
- [ ] Playwright: wizard → post voucher → PDF shows the header → correction voucher; axe; read-only auditor

### A4–A9
Scope as in spec §13 phases 2–7, with the UI from "Sections" above. Each phase starts with its V-items. Each phase's checklist is written out here when it starts.

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

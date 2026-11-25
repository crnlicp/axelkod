# Axelkod AB – Accounting module for the Admin panel (ICP)

> **Source of truth:** `~/.claude/icp/RULES.md` and the current ICP skills (`icp-cli`, `static-site`, `writing-motoko`, `user-sign-in`, `custom-domains`, `canister-security`) win over this spec. Where this spec conflicts with them, follow RULES.md / the skills and list the conflict in your plan.

## 0. Role and working method

You are a senior ICP engineer (Motoko, `icp-cli`, certified-assets frontend, Internet Identity) **and** a Swedish accounting domain expert (Bokföringslagen, BFNAR 2013:2, Mervärdesskattelagen 2023:200, Skatteförfarandelagen, BAS chart of accounts, payroll). You are extending the existing Axelkod website + Admin panel with a complete accounting section.

- Read RULES.md, the named skills and the existing repository **before** planning. Reuse the existing admin auth, settings, layout, i18n and design system.
- First deliver: a short plan, the file tree, the full Candid/Motoko type model, and a list of open questions and conflicts. Wait for approval, then build in the phases of section 12.
- Local work only with `--identity anonymous`. **Any mainnet step (`icp deploy -e ic`, canister creation, cycles) needs my explicit approval** and uses `prod-identity` with `--identity-password-file ~/.identity-pw`.
- Never invent legal rules, rates, XML field codes or schema elements. Where this spec says "verify", fetch the official spec (Skatteverket, BFN, SIE-gruppen) and cite it in `docs/accounting/`.

## 1. Goal

One place in the Admin panel to run Axelkod AB's books and obligations:

- double-entry bookkeeping (BAS), vouchers, ledgers
- sales: quotes, invoices, credit notes, payments, reminders, OCR, e-invoice export
- purchases: supplier invoices, receipts, expense claims, with the received original files
- bank and tax account (skattekonto) reconciliation
- VAT return, EU sales list (periodisk sammanställning)
- payroll, payslips, employer return (AGI), vacation, benefits, expenses
- ROT/RUT (husavdrag). Note: RUT covers IT services to households, so it is relevant to Axelkod
- fixed assets and depreciation, parts inventory, year-end closing
- all reports and filing files for Skatteverket, plus SIE4 export for the annual report tool
- a deadlines calendar for all obligations

## 2. Core principle: store data, generate documents on demand

1. **Only structured data is stored.** No generated PDF, XML, SRU or SIE file is ever stored in a canister. Every document and file is generated in the browser on demand from stored data and downloaded, printed or shared.
2. **Deterministic re-generation.** An issued document (invoice, credit note, reminder, payslip, filed VAT return) must re-render identically years later. So, at issue time, store:
   - a **snapshot** of all printed data, including the seller header (company name, org. nr, VAT nr, registered office, address, contact details, bankgiro, F-tax text) taken from Admin settings *at that moment*, the customer data and all lines and totals
   - `templateVersion` (templates are versioned in code and old versions are never changed or deleted)
   - `contentHash` = SHA-256 of the canonical JSON of the snapshot. Show the first 8 hex characters in the PDF footer and verify the hash on every render.
3. **Legal exception: received documents.** Supplier invoices, receipts and other documents *received from others* are räkenskapsinformation and must be preserved for the full retention period. They cannot be regenerated, so their **original bytes** (image or PDF exactly as received) are stored in the `vault` canister (section 5). This is the only place files are stored. Everything Axelkod creates itself is regenerated.
4. **Header from settings.** All PDFs use one shared header/footer component. Logo and contact details come from Admin settings (live settings for reports, the stored snapshot for issued documents). Extend Admin settings with any missing legal fields: org. nr, VAT nr (SE + org nr + 01), registered office (säte), bankgiro, IBAN/BIC, "Godkänd för F-skatt" flag, invoice email, Peppol ID.

## 3. Swedish legal and domain requirements (implement as rules, keep rates in data)

### 3.1 Bookkeeping (BFL 1999:1078, BFNAR 2013:2)
- Double entry: every voucher balances (debits = credits) in SEK. Booking timing: cash/card by the next working day, other events as soon as possible. Show warnings for late booking.
- **Voucher (verifikation)** content: when it was compiled, date of the business event, what it concerns, amount, counterparty, a unique sequential number (gapless per series and financial year), and links to underlying documents.
- **Corrections only through a new correction voucher** (rättelsepost) that references the original, records date and who made it. Posted vouchers and issued invoices are immutable. No edit or delete endpoints exist for posted data.
- Presentations: **grundbok** (journal in registration order) and **huvudbok** (general ledger in account order). Sub-ledgers: customer and supplier ledgers, fixed asset register, inventory.
- **Systemdokumentation** (system documentation: chart of accounts, VAT codes, series, number logic, automatic postings, integrations) and **behandlingshistorik** (processing history: append-only audit log of every action) must exist and be exportable.
- **Retention:** all räkenskapsinformation is kept until the end of the 7th year after the calendar year in which the financial year ended. Digital-only is allowed since 1 July 2024. Each record gets `retainUntil`; nothing can be deleted before it, not even on a GDPR request (legal obligation wins; pseudonymise non-accounting data only).
- **Storage location:** electronic räkenskapsinformation must be kept in Sweden, or in another EU country if the storage location (and every change to it) is reported to Skatteverket. Deploy `accounting` and `vault` on the **European subnet** (nodes in Europe only), and add a manual checklist item "notify Skatteverket of storage location" to the setup wizard. Also provide a regular full backup export (section 10) that the owner stores in Sweden, kept separate from the original.
- Financial year: calendar year by default. The first year can be extended up to 18 months. Support `#open | #closing | #locked` and a lock date (låsdatum) that blocks postings into closed periods.
- Accounting method: invoice method (faktureringsmetoden) by default. Support the cash method (kontantmetoden) flag for small companies (VAT reported when paid, open items booked at year end).

### 3.2 Invoicing (ML 2023:200 ch. 17, Räntelagen, Inkassolagen, ABL)
- Full invoice must contain: issue date; unique sequential number; seller VAT nr; buyer VAT nr when the buyer is liable (reverse charge, intra-EU); seller and buyer name and address; quantity and nature of goods or extent and nature of services; delivery or completion date (or prepayment date) if different from issue date; taxable amount per rate, unit price excl. VAT, discounts; VAT rate; VAT amount; special references when relevant ("Omvänd betalningsskyldighet / Reverse charge", exemption ground, margin scheme). Verify the full list against ML 17 kap. 24 § before coding the validator.
- Limited company: also org. nr and registered office (ABL). Recommended: "Godkänd för F-skatt" (default on).
- **Simplified invoice** allowed up to 4,000 SEK incl. VAT (configurable parameter).
- Foreign currency invoices: store the exchange rate and date. When Swedish VAT is charged, also show the VAT amount in SEK (verify ML wording).
- Credit notes must reference the original invoice and carry the same mandatory content.
- Default terms: 30 days B2B. Late interest = Riksbank reference rate + 8 percentage points (store the reference rate per half-year in TaxParameters). B2B late-payment compensation **450 SEK** (förseningsersättning) needs no prior agreement, but then no reminder or collection fee may be charged. **Reminder fee 60 SEK** only if agreed in advance (customer flag `reminderFeeAgreed`). No interest on fees.
- OCR reference: numeric, with Luhn (mod 10) check digit, optional length digit; configurable.
- E-invoice: export **Peppol BIS Billing 3.0 (UBL)** XML on demand (public sector requires e-invoices).

### 3.3 VAT
- Rates 25 / 12 / 6 / 0 % as data. The default for parts and IT services is 25 %.
- VAT codes map each line to accounts **and** to VAT return boxes:
  - **05** taxable sales, **10/11/12** output VAT 25/12/6 %
  - **20** EU goods purchases, **21** EU service purchases, **22** non-EU service purchases, **23** domestic goods with reverse charge, **24** domestic services with reverse charge; **30/31/32** output VAT on those
  - **35** goods sales to EU (also in the EU sales list), **36** goods sales outside EU, **39** services sold to EU businesses under the main rule, **40** other sales of services outside Sweden, **41** sales where the buyer is liable in Sweden, **42** other exempt sales
  - **48** input VAT, **49** VAT to pay or refund; **50/60/61/62** import
  - Verify the current box list on Skatteverket's "Fylla i momsdeklarationen" page and keep the mapping in `docs/accounting/vat-boxes.md`.
- VAT period: month / quarter / year (from settings and Skatteverket's decision). Deadline is usually the 12th of the second month after the period (17th in Aug and Jan); compute it from rules plus a holiday calendar.
- On filing: lock the period, store box values plus the source voucher list hash, create the settlement voucher (2610–2647 → 2650), and track payment to the tax account (1630).
- **EU sales list (periodisk sammanställning):** buyer VAT nr, goods amount, triangulation flag, services amount; due on the 25th of the month after the period; no list in periods without such sales. Optional VIES VAT-number check via HTTPS outcall (with a transform function; store result and timestamp).

### 3.4 Payroll and employer return (AGI)
- Employee master data, monthly or hourly pay, tax table and column (or 30 % for non-main income), jämkning decision, birth year (fee category), owner/related flag.
- **Tax tables:** import Skatteverket's yearly tables as data (open-data files or API on Skatteverket's developer portal). Never hard-code.
- **Employer contribution categories** as dated rules in TaxParameters (2026): 31.42 % standard; 10.21 % (age pension contribution only) for those who were 67+ at the start of the year; 0 % for people born 1937 or earlier; **temporary youth reduction 1 Apr 2026 – 30 Sep 2027**: 20.81 % on pay up to 25,000 SEK/month for people born 2003–2007 (in 2026), full rate above that.
- **Växa-stöd:** since January 2026 it is **not** claimed in the AGI. It is a separate refund application per month after the AGI has been filed, and never for owners or their relatives. Model `VaxaApplication` as a separate record and report (data for the e-service), with eligibility checks.
- Pay items (lönearter) carry: taxable?, fee-bearing?, vacation-pay-bearing?, AGI field code, debit/credit accounts. Cover salary, overtime, sick pay (with karensavdrag), vacation pay (sammalöneregeln / procentregeln 12 %), benefits (e.g. car via Skatteverket formula), tax-free allowances (mileage 25 SEK/mil own car 2026, per diem 300 SEK/day 2026, with reductions), expense reimbursements, net deductions.
- Monthly **AGI**: main record (huvuduppgift) plus individual records (individuppgift) per payee with field codes, absence data (frånvarouppgift) where needed. Generate **XML per Skatteverket's technical description (schema 1.1, current document version)**. Validate in tests against the official XSD and document a manual check in Skatteverket's free test service. Zero returns are supported.
- Payslip PDF for each employee (data the AGI reports must also be shown to the employee).
- Postings: 7010/7210 salaries, 7510 employer contributions, 2710 withheld tax, 2731 contributions payable, 2920/7290 vacation accrual, 1930 bank.

### 3.5 ROT/RUT (husavdrag)
- 2026: ROT 30 % and RUT 50 % of labour cost; combined cap 75,000 SEK per person per year, of which ROT max 50,000. Rates and caps are dated TaxParameters.
- The invoice shows the deduction; the customer pays the rest; after payment, create a claim (begäran om utbetalning) with buyers (personnummer encrypted), shares, labour, material and other costs, hours, work category, property designation or BRF org. nr + apartment nr (ROT), payment date and paid amount.
- Generate the **XML file for Skatteverket's "Rot och rut – företag" e-service** (current schema version; never mix ROT and RUT in one file). Import the decision JSON export to update the case and post the payout voucher.
- The claim must reach Skatteverket by **31 January** of the year after payment. From **1 Jan 2027** claims must also state whether subcontractors or staffing companies were used, and be confirmed on honour. Add these fields now.

### 3.6 Company tax and year-end
- Corporate tax 20.6 % and periodiseringsfond max 25 % as TaxParameters; base amounts 2026 (PBB 59,200; IBB 83,400). Small equipment limit = half PBB.
- Year-end wizard: inventory count → depreciation run → accruals/prepayments → reconcile bank, tax account, VAT, payroll liabilities → tax calculation → appropriations → closing vouchers → lock year → opening balances for the next year.
- Outputs: income statement and balance sheet (K2 layout), INK2 data (INK2R, INK2S) via a BAS → SRU code mapping, **SRU files** (`INFO.SRU` + `BLANKETTER.SRU`, filenames must not be changed) for Skatteverket's Filöverföring, and **SIE4** export for a K2 annual report tool. Digital annual report submission (iXBRL) to Bolagsverket is out of scope for v1. Keep the data model ready for it.
- Owner items: K10 inputs (salary basis, dividends) as notes and reports, not filed by the app.

### 3.7 Deadlines engine
Generate a calendar from settings and rules: VAT returns, AGI (12th, 17th in Jan/Aug), prepaid tax (debiterad preliminärskatt) on the 12th, EU sales list (25th), INK2, AGM (within 6 months), annual report (within 7 months), ROT/RUT (31 Jan), växa applications (within 1 year), K10. Show overdue and upcoming items on the dashboard.

## 4. Architecture

- New canisters (follow RULES.md "Folder structure", grouped layout if RULES.md prefers it):
  - `canisters/accounting/`: Motoko ledger, sales, purchases, VAT, payroll, ROT/RUT, assets, inventory, settings, audit log
  - `canisters/vault/`: Motoko chunked blob store for **received** originals only
- Existing: `canisters/frontend/` (`@dfinity/static-site` recipe, certified-assets canister) hosts the Admin UI. Existing backend canister (`canisters/backend/`) holds company/contact settings.
- `accounting` reads company settings from the backend canister through an inter-canister query when issuing documents and stores the snapshot. The frontend never supplies the seller snapshot.
- Create `accounting` and `vault` on the **European subnet**: `icp canister create <name> -e ic --subnet <European subnet principal>` (look up the current subnet ID in the ICP docs or dashboard; mainnet step, needs my approval).
- Frontend packages: the ones named by the current `icp-cli` / `user-sign-in` skills (`@icp-sdk/*`). Canister IDs come from the `ic_env` cookie.
- PDF and file generation runs **in the browser** in a Web Worker inside the lazy-loaded admin bundle: `pdf-lib` (or `@react-pdf/renderer`, pick one and justify), self-hosted fonts with full Swedish characters, A4, sv-SE number and date formats. XML is built with a small typed builder and validated in tests against the official XSDs.
- Large reports: canister methods are paginated queries; the browser aggregates. No heavy computation in update calls.

## 5. Security and privacy

- Access control: `authorize`d principals on the frontend for admin routes; canister-side role checks on **every** method. Roles: `#owner` (everything, settings, roles), `#bookkeeper` (create/post, no settings), `#payroll` (payroll only), `#auditor` (read-only, exports). Reject the anonymous principal. Controllers are for deployment only, never admins.
- **Encryption with vetKeys** (client-side) for: personnummer, private customers' addresses for ROT/RUT, employee bank accounts and contact details, and all vault files. Amounts and accounting fields stay plaintext for reporting. Document key derivation, rotation and recovery (owner + backup admin).
- Vault: chunk uploads (≤ 1.9 MB per chunk, the IC message limit is about 2 MB), SHA-256 per file and per chunk verified on finalize, MIME allow-list (PDF, JPEG, PNG, HEIC, XML), max size per file, no overwrite, append-only.
- Behandlingshistorik: append-only audit log with a hash chain (`prevHash`) for every create/post/correct/lock/export/login/settings change, with principal and timestamp. Exportable.
- Follow the `canister-security` skill: input validation, size caps, cycle-drain protection, inspect-message where applicable, upgrade safety.
- Internet Identity: principals depend on the origin; set a derivation origin before the custom domain changes. Admin routes on `axelkod.eu` must keep the same principals.

## 6. Data model (Motoko, `mo:core` only, persistent actor, `types.mo`)

Conventions: `Money = Int` in **öre** (signed); `Qty = Int` in thousandths; `Bp = Nat` basis points for rates; `Date = Text` ISO `YYYY-MM-DD` validated; `Time = Int` ns; IDs are `Nat` from per-entity counters; every record has `createdAt`, `createdBy`, `retainUntil` where it is räkenskapsinformation. Encrypted fields are `Blob` (vetKeys ciphertext) with a `…Enc` suffix.

```motoko
// ---------- Company & settings ----------
type CompanySnapshot = {
  legalName : Text; orgNr : Text; vatNr : Text; registeredOffice : Text;
  street : Text; postalCode : Text; city : Text; country : Text;
  email : Text; phone : ?Text; web : ?Text;
  bankgiro : ?Text; plusgiro : ?Text; iban : ?Text; bic : ?Text;
  fSkatt : Bool; peppolId : ?Text; logoAssetPath : Text; capturedAt : Time;
};
type AccountingSettings = {
  defaultCurrency : Text;                        // "SEK"
  accountingMethod : { #invoice; #cash };
  vatPeriod : { #month; #quarter; #year };
  invoiceTermsDays : Nat; reminderPolicy : ReminderPolicy;
  ocr : { enabled : Bool; withLengthDigit : Bool };
  lockDate : ?Date; defaultLanguage : { #sv; #en };
  storageNoticeSentToSkatteverket : ?Date;      // BFL 7:3a checklist
};

// ---------- Fiscal years, accounts, VAT ----------
type FiscalYear = { id : Nat; start : Date; end_ : Date; status : { #open; #closing; #locked }; lockedAt : ?Time };
type AccountType = { #asset; #liability; #equity; #revenue; #expense };
type Account = { number : Nat; name : Text; kind : AccountType; vatCode : ?Text; sruCode : ?Text; active : Bool; bas : Bool };
type VatKind = { #outputDomestic; #inputDomestic; #reverseChargePurchase; #euGoodsSale; #euServiceSale;
                 #exportGoods; #exportServices; #exempt; #buyerLiableSE; #importVat };
type VatCode = { code : Text; rateBp : Nat; kind : VatKind; boxBase : ?Nat; boxVat : ?Nat; boxInputVat : ?Nat; account : Nat };
type Series = { code : Text; name : Text };     // A manual, F sales, L supplier, B bank, P payroll, M VAT, X year-end, C correction

// ---------- Vouchers (immutable once posted) ----------
type VoucherLine = { account : Nat; amount : Money; /* + debit, - credit */ vatCode : ?Text;
                     costCenter : ?Text; project : ?Text; quantity : ?Qty; text : ?Text };
type SourceRef = { #manual; #salesInvoice : Nat; #creditNote : Nat; #purchase : Nat; #payment : Nat;
                   #bankTx : Nat; #taxAccount : Nat; #payRun : Nat; #vatReturn : Nat; #rotRut : Nat;
                   #asset : Nat; #inventory : Nat; #yearEnd : Nat };
type Voucher = {
  id : Nat; fiscalYearId : Nat; series : Text; number : Nat;          // gapless per series+FY
  eventDate : Date; registeredAt : Time; description : Text;
  lines : [VoucherLine]; source : SourceRef; attachmentIds : [Nat];
  counterparty : ?Text; corrects : ?Nat; correctedBy : ?Nat;
  createdBy : Principal; retainUntil : Date;
};
type VoucherDraft = { id : Nat; /* mutable, no number until posted */ series : Text; eventDate : Date;
                      description : Text; lines : [VoucherLine]; attachmentIds : [Nat] };

// ---------- Parties & catalogue ----------
type Customer = { id : Nat; kind : { #company; #private }; name : Text;
                  orgNr : ?Text; personnummerEnc : ?Blob; vatNr : ?Text; vatNrCheckedAt : ?Time;
                  address : Address; country : Text; email : ?Text; peppolId : ?Text;
                  termsDays : Nat; language : { #sv; #en }; reminderFeeAgreed : Bool; active : Bool };
type Supplier = { id : Nat; name : Text; orgNr : ?Text; vatNr : ?Text; country : Text;
                  bankgiro : ?Text; plusgiro : ?Text; iban : ?Text; bic : ?Text; defaultAccount : ?Nat; active : Bool };
type Item = { id : Nat; sku : Text; name : Text; unit : Text; priceExVat : Money; vatCode : Text;
              salesAccount : Nat; kind : { #goods; #service; #labour }; stocked : Bool; oemNumber : ?Text };

// ---------- Sales ----------
type InvoiceLine = { itemId : ?Nat; description : Text; quantity : Qty; unit : Text; unitPrice : Money;
                     discountBp : Nat; vatCode : Text; account : Nat; lineNet : Money; lineVat : Money;
                     rotRutKind : ?{ #labour; #material; #other }; hours : ?Qty };
type VatSummaryRow = { rateBp : Nat; base : Money; vat : Money };
type InvoiceSnapshot = {                         // everything printed; hashed
  seller : CompanySnapshot; customer : Customer; language : { #sv; #en };
  issueDate : Date; deliveryDate : ?Date; deliveryPeriod : ?(Date, Date); dueDate : Date;
  currency : Text; fxRate : ?{ rate : Nat; /* x1e6 */ date : Date };
  lines : [InvoiceLine]; vatSummary : [VatSummaryRow]; totalNet : Money; totalVat : Money;
  rounding : Money; total : Money; totalVatSek : ?Money;
  legalNotes : [Text];                           // reverse charge, exemption ground, F-skatt
  ocr : ?Text; ourRef : ?Text; yourRef : ?Text; paymentTermsText : Text; lateInterestBp : Nat;
  rotRut : ?RotRutInvoicePart;
};
type SalesDocKind = { #quote; #invoice; #creditNote; #reminder };
type SalesDocStatus = { #draft; #issued; #sent; #partiallyPaid; #paid; #overdue; #credited; #accepted; #expired };
type SalesDoc = { id : Nat; kind : SalesDocKind; series : Text; number : ?Nat; status : SalesDocStatus;
                  draft : ?InvoiceSnapshot; snapshot : ?InvoiceSnapshot;   // snapshot set & frozen at issue
                  templateVersion : ?Text; contentHash : ?Blob; creditOf : ?Nat; quoteOf : ?Nat;
                  voucherId : ?Nat; paymentIds : [Nat]; deliveries : [Delivery]; retainUntil : ?Date };
type Delivery = { at : Time; channel : { #pdfDownload; #email; #peppol; #print }; to : ?Text; by : Principal };
type Payment = { id : Nat; date : Date; amount : Money; method : { #bankgiro; #swish; #card; #transfer; #cash };
                 reference : ?Text; salesDocId : ?Nat; purchaseId : ?Nat; bankTxId : ?Nat; voucherId : Nat };
type ReminderPolicy = { daysAfterDue : [Nat]; useForseningsersattningB2B : Bool; reminderFeeIfAgreed : Bool };

// ---------- Purchases & received documents ----------
type PurchaseDoc = { id : Nat; kind : { #supplierInvoice; #receipt; #expenseClaim; #creditNote };
                     supplierId : ?Nat; employeeId : ?Nat; docDate : Date; dueDate : ?Date; docNumber : ?Text;
                     currency : Text; fxRate : ?{ rate : Nat; date : Date };
                     lines : [{ account : Nat; net : Money; vatCode : Text; vat : Money; text : ?Text }];
                     total : Money; paymentRef : ?Text; status : { #inbox; #booked; #paid; #disputed };
                     attachmentIds : [Nat]; voucherId : ?Nat; retainUntil : Date };
type Attachment = { id : Nat; vaultFileId : Nat; filename : Text; mime : Text; size : Nat; sha256 : Blob;
                    receivedVia : { #upload; #email; #scan }; uploadedAt : Time; uploadedBy : Principal;
                    linkedTo : [SourceRef]; encrypted : Bool; retainUntil : Date };

// ---------- Bank & tax account ----------
type BankAccount = { id : Nat; name : Text; ledgerAccount : Nat; /* 1930 */ ibanEnc : ?Blob; bank : Text };
type BankTx = { id : Nat; bankAccountId : Nat; date : Date; amount : Money; text : Text; reference : ?Text;
                counterparty : ?Text; importBatch : Nat; matched : ?SourceRef; voucherId : ?Nat };
type TaxAccountEntry = { id : Nat; date : Date; amount : Money; text : Text;
                         kind : { #vat; #agi; #prelimTax; #interest; #fee; #payment; #refund; #other };
                         voucherId : ?Nat; importBatch : Nat };

// ---------- VAT & EU sales list ----------
type VatReturn = { id : Nat; from_ : Date; to : Date; boxes : [(Nat, Money)]; sourceHash : Blob;
                   status : { #draft; #locked; #filed }; filedAt : ?Time; receiptRef : ?Text;
                   settlementVoucherId : ?Nat; dueDate : Date };
type EcSalesList = { id : Nat; period : Text; rows : [{ vatNr : Text; goods : Money; triangulation : Money; services : Money }];
                     status : { #draft; #filed }; filedAt : ?Time; corrects : ?Nat };

// ---------- Payroll ----------
type Employee = { id : Nat; name : Text; personnummerEnc : Blob; addressEnc : Blob; bankAccountEnc : Blob;
                  email : ?Text; birthYear : Nat; employedFrom : Date; employedTo : ?Date;
                  pay : { #monthly : Money; #hourly : Money }; taxTable : ?Nat; taxColumn : ?Nat;
                  flatTaxBp : ?Nat; /* 3000 = 30 % side income */ jamkning : ?Text;
                  vacationRule : { #sammaloneregeln; #procentregeln }; vacationDays : Nat;
                  isOwnerOrRelated : Bool; costCenter : ?Text; active : Bool };
type PayItem = { code : Text; name : Text; taxable : Bool; feeBearing : Bool; vacationBearing : Bool;
                 agiFieldCode : ?Nat; debitAccount : Nat; creditAccount : Nat };
type PayLine = { code : Text; text : Text; quantity : Qty; rate : Money; amount : Money };
type Absence = { kind : { #sick; #vab; #parental; #vacation; #unpaid; #other }; from_ : Date; to : Date; extentBp : Nat };
type Payslip = { employeeId : Nat; lines : [PayLine]; gross : Money; benefits : Money; taxFree : Money;
                 taxWithheld : Money; net : Money; feeCategory : Text; feeBase : Money; employerFees : Money;
                 vacationAccrual : Money; absences : [Absence] };
type PayRun = { id : Nat; period : Text; paymentDate : Date; status : { #draft; #approved; #paid; #reported };
                payslips : [Payslip]; voucherId : ?Nat; agiReturnId : ?Nat; snapshotHash : ?Blob };
type AgiReturn = { id : Nat; period : Text; mainRecord : [(Nat, Money)]; /* field code -> amount */
                   individualRecords : [{ employeeId : Nat; specNr : Nat; fields : [(Nat, Text)] }];
                   status : { #draft; #filed }; filedAt : ?Time; corrects : ?Nat };
type VaxaApplication = { id : Nat; period : Text; employeeId : Nat; refund : Money;
                         status : { #draft; #submitted; #approved; #rejected } };

// ---------- ROT / RUT ----------
type RotRutInvoicePart = { kind : { #rot; #rut }; labour : Money; material : Money; other : Money;
                           deduction : Money; buyers : [{ nameEnc : Blob; personnummerEnc : Blob; shareBp : Nat }];
                           propertyDesignation : ?Text; brfOrgNr : ?Text; apartmentNr : ?Text; workCategory : Text };
type RotRutCase = { id : Nat; salesDocId : Nat; kind : { #rot; #rut }; paymentDate : ?Date; paidAmount : ?Money;
                    requested : Money; hours : Qty; subcontractorsUsed : ?Bool; confirmedOnHonour : Bool;
                    status : { #draft; #submitted; #approved; #partially; #rejected };
                    decisionAmount : ?Money; decisionDate : ?Date; voucherId : ?Nat; deadline : Date };

// ---------- Fixed assets & inventory ----------
type FixedAsset = { id : Nat; name : Text; account : Nat; acquired : Date; cost : Money; residual : Money;
                    lifeMonths : Nat; method : { #straightLine; #k2Simplified };
                    depreciations : [{ period : Text; amount : Money; voucherId : Nat }];
                    disposed : ?{ date : Date; proceeds : Money; voucherId : Nat } };
type StockMove = { id : Nat; itemId : Nat; date : Date; qty : Qty; unitCost : Money;
                   reason : { #purchase; #sale; #adjust; #count; #return }; ref : ?SourceRef };
type InventoryCount = { id : Nat; date : Date; rows : [{ itemId : Nat; qty : Qty; unitCost : Money }]; voucherId : ?Nat };

// ---------- Parameters, obligations, audit ----------
type TaxParameters = { year : Nat; employerFees : [{ category : Text; rateBp : Nat; from_ : Date; to : ?Date; capPerMonth : ?Money }];
                       pbb : Money; ibb : Money; corporateTaxBp : Nat; periodiseringsfondBp : Nat;
                       mileageTaxFreePerMil : Money; perDiemFull : Money; rotBp : Nat; rutBp : Nat;
                       rotRutCap : Money; rotCap : Money; referenceRates : [{ from_ : Date; rateBp : Int }];
                       reminderFee : Money; forseningsersattning : Money; simplifiedInvoiceLimit : Money;
                       source : Text /* URL */ };
type Obligation = { kind : Text; period : Text; dueDate : Date; status : { #upcoming; #done; #overdue }; ref : ?SourceRef };
type AuditEntry = { seq : Nat; at : Time; principal : Principal; action : Text; entity : Text; entityId : ?Nat;
                    detailHash : Blob; prevHash : Blob };
```

Seed data (as code, versioned, documented in `docs/accounting/`): BAS 2026 accounts Axelkod needs (1220, 1460, 1510, 1630, 1930, 2081, 2099, 2440, 2510, 2611–2647, 2650, 2710, 2731, 2920, 2941, 3001–3308, 3740, 4010, 4515, 4531, 5410, 6110, 6212, 6230, 6540, 6570, 7010, 7210, 7290, 7510, 7690, 7832, 8310, 8410, 8811, 8910, 8999, …), VAT codes with box mapping, series, pay items with AGI field codes (verify against the current AGI technical description), BAS → SRU mapping for INK2R/INK2S, TaxParameters 2026.

## 7. Canister API (sketch; finalise in the plan)

- `accounting` mixins: `SettingsMixin`, `LedgerMixin` (drafts, post, correct, ledgers paged), `PartiesMixin`, `SalesMixin` (quote → invoice → issue → credit, payments, reminders), `PurchasesMixin`, `BankMixin` (import batch, match), `VatMixin` (compute, lock, file, settle, EC sales list), `PayrollMixin` (employees, run, approve, pay, AGI data, växa), `RotRutMixin`, `AssetsMixin`, `InventoryMixin`, `YearEndMixin`, `ObligationsMixin`, `AuditMixin`, `ParametersMixin`.
- Every list method is a paged `query` with filters (period, status, account, party). Every state change is an `update` that checks role, validates, writes the audit entry and returns `Result`.
- `vault`: `beginUpload(meta) → uploadId`, `putChunk(uploadId, index, bytes)`, `finalize(uploadId, sha256) → fileId`, `getChunk(fileId, index)` (authorized query), no delete before `retainUntil`.
- Numbering: per-(series, fiscal year) counters incremented only inside the posting update. Drafts never consume numbers. Test gaplessness.

## 8. Admin UI (React, under the existing admin, Swedish default + English)

Sections: **Översikt** (dashboard: cash, receivables, payables, VAT due, deadlines) · **Försäljning** (customers, items, quotes, invoices, credit notes, payments, reminders) · **Inköp** (inbox with drag-drop upload and camera, supplier invoices, receipts, expense claims) · **Bank & skattekonto** (CSV import, matching rules, reconciliation) · **Bokföring** (vouchers, journal, general ledger, trial balance, corrections) · **Moms** (returns, EU sales list) · **Lön** (employees, pay runs, payslips, AGI, växa) · **ROT/RUT** · **Tillgångar & lager** · **Bokslut** (year-end wizard) · **Rapporter & export** · **Inställningar** (company legal data, series, VAT codes, chart of accounts, parameters, roles, backup).

UX rules: guided flows with validation messages that name the legal requirement; a preview before every issue or post action ("this creates voucher F-123, cannot be undone"); keyboard-friendly tables; all money as `1 234,56 kr`.

## 9. Documents and files generated on demand

| Output | Format | Data source |
| --- | --- | --- |
| Quote, invoice, credit note, reminder (sv/en) | PDF | SalesDoc snapshot + templateVersion |
| Payslip | PDF | PayRun snapshot |
| Voucher with attachment list | PDF | Voucher |
| Journal (grundbok), general ledger (huvudbok), trial balance | PDF + CSV | Vouchers (paged) |
| Customer and supplier ledgers, aged receivables/payables | PDF + CSV | SalesDoc / PurchaseDoc / Payment |
| VAT report + **VAT return XML** (Skatteverket "Lämna momsdeklaration via fil" format) | PDF + XML | VatReturn |
| **EU sales list file** (Filöverföring format) | PDF + file | EcSalesList |
| **AGI XML** (schema 1.1) | PDF summary + XML | AgiReturn |
| **ROT/RUT XML** (current Rot & rut schema) | PDF + XML | RotRutCase |
| Växa application summary | PDF | VaxaApplication |
| Income statement, balance sheet (K2 layout), notes data | PDF | Ledger |
| **INK2 SRU files** (`INFO.SRU`, `BLANKETTER.SRU`) | SRU | Ledger + SRU mapping |
| **SIE4** (SIE 4C spec, typ 4) | SIE | Ledger, accounts, IB/UB |
| **Peppol BIS Billing 3.0** invoice | UBL XML | SalesDoc snapshot |
| Fixed asset register, inventory list, depreciation schedule | PDF + CSV | Assets / Inventory |
| Behandlingshistorik (audit log) | PDF + CSV | AuditEntry |
| Systemdokumentation | PDF | Settings, accounts, VAT codes, series, rules, versions |
| Full backup | ZIP (JSON + SIE4 + vault files + manifest with hashes) | Everything |

**PDF header/footer (shared component):** logo, legal name, org. nr, VAT nr, registered office, address, phone, email, web, bankgiro/IBAN, "Godkänd för F-skatt". Footer: document type + number, page x/y, generated-at timestamp, short content hash, and "Axelkod AB, org.nr …". Issued documents use their snapshot; reports use current settings and say "Genererad <date>".

## 10. Backup, export and continuity

- One-click full backup (section 9), encrypted with a passphrase, for the owner to store in Sweden separately from the canisters.
- SIE4 export at any time, so an accountant or another system can take over.
- Restore into a fresh local network for verification (tested in CI).
- Canister upgrades: migrations chain in `src/migrations/`. Never change the meaning of stored fields; add new fields as optional.

## 11. ICP platform limits to respect

- Use `icp-cli` (`icp.yaml`, `icp network start -d`, `icp deploy`, `icp deploy -e ic`). No legacy tooling.
- One message is about 2 MB, so chunk vault uploads at ≤ 1.9 MB. Error pages must stay under 1.9 MB.
- The certified-assets canister adds no default security headers. Declare all of them in `canisters/frontend/public/_headers` (patterns match files such as `/index.html`). A strict CSP with prerendered React needs `sha256` hashes for inline scripts. Allow `worker-src 'self' blob:` for the PDF worker.
- Admin SPA routes via a `_redirects` rewrite with status `200`, scoped to `/admin/*`.
- The IC can't redirect by hostname. Keep the www handling at DNS / canonical links.
- Internet Identity principals depend on the origin. Keep the derivation origin stable.
- Plan memory for the persistent actor: estimate growth (vouchers, documents per year × 7+ years) and keep the vault in its own canister.
- Instruction limits: no unbounded loops in updates. Paginate and do aggregation in the browser.

## 12. Folder layout (adjust to RULES.md "Folder structure")

```
canisters/accounting/
  src/main.mo            # persistent actor: state + mixins only
  src/types.mo
  src/lib/               # money.mo, dates.mo, numbering.mo, ledger.mo, vat.mo, invoice.mo, ocr.mo,
                         # payroll.mo, employerFees.mo, rotrut.mo, assets.mo, inventory.mo, audit.mo, validation.mo
  src/mixins/            # one mixin per area (section 7)
  src/migrations/        # migration chain
  accounting.did         # curated, committed
  test/                  # mops test
canisters/vault/
  src/main.mo  src/types.mo  src/lib/  src/mixins/  src/migrations/  vault.did  test/
canisters/frontend/app/admin/accounting/      # routes, pages, components
canisters/frontend/app/admin/accounting/pdf/  # header.tsx, footer.tsx, templates/<doc>@<version>.tsx, worker.ts
canisters/frontend/app/admin/accounting/exporters/  # momsXml.ts, agiXml.ts, ecSalesList.ts, rotRutXml.ts,
                                                    # sru.ts, sie4.ts, peppolUbl.ts, csv.ts, backup.ts
canisters/frontend/app/i18n/sv/accounting.json
canisters/frontend/app/i18n/en/accounting.json
canisters/frontend/public/_headers   canisters/frontend/public/_redirects
canisters/frontend/tests/            # Playwright
docs/accounting/                     # system documentation, vat-boxes.md, agi-fields.md, bas-sru-map.md,
                                     # sources.md (official URLs + retrieval date), deadlines.md
```

Generated bindings are not committed. Curated `.did` files are.

## 13. Phases and acceptance criteria

1. **Foundation:** `accounting` + `vault` canisters, roles, settings (incl. company legal fields), fiscal years, BAS seed, series, gapless numbering, drafts → post → correct, lock date, audit hash chain, attachments, journal/ledger/trial balance PDFs with the shared header.
2. **Sales:** customers, items, quotes, invoices (all mandatory fields validated), credit notes, OCR, snapshots + hash + versioned templates, payments, reminders (60/450 rules), Peppol export.
3. **Purchases & bank:** inbox upload to vault, supplier invoices/receipts/expense claims, EU reverse-charge purchases, bank CSV import + matching, tax account import.
4. **VAT:** box mapping, return computation, lock/file/settle, VAT return XML, EU sales list file, VIES check.
5. **Payroll:** employees (encrypted PII), tax table import, pay items, pay runs, employer fee categories incl. youth reduction dates, vacation, payslip PDF, AGI XML, växa application data.
6. **ROT/RUT:** invoice part, claim case, XML export, decision import, 31 Jan deadline, 2027 fields.
7. **Assets, inventory, year-end & exports:** depreciation, stock moves and counts, year-end wizard, K2 statements, SRU, SIE4, backup/restore, system documentation, deadlines dashboard.

Each phase is done only when:
- `mops test` passes in `canisters/accounting/test/` and `canisters/vault/test/`: balancing, gapless numbering under concurrency, immutability, lock date, role checks, VAT box fixtures, employer-fee categories (incl. someone born 2005 paid in May 2026 → 20.81 % up to 25,000), OCR Luhn, ROT/RUT caps, retention guard.
- Playwright passes in `canisters/frontend/tests/`: issue invoice → PDF renders with header from settings → change settings → old invoice PDF still shows old snapshot and identical hash; VAT return XML and AGI XML validate against the official XSDs; SIE4 round-trip parses.
- Generated files are checked manually once in Skatteverket's test services (AGI test service, Filöverföring test) and the result is noted in `docs/accounting/sources.md`.

## 14. Out of scope for v1 (keep the model ready)

- Direct submission to Skatteverket or Bolagsverket APIs (requires agreements with the agencies). v1 exports files that I upload in their e-services with BankID.
- iXBRL annual report and digital submission (use a K2 tool fed by SIE4).
- Bank APIs (v1 uses file import), email sending of invoices (v1 = download/print/share), multi-currency revaluation beyond invoice-date rates.

## 15. Before you start coding

Check this spec against RULES.md and the skills named at the top. List every remaining conflict, every rate or format you need to verify (with the official URL you will use), and your open questions. Then wait for my go-ahead.

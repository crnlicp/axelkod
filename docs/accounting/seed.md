# Accounting seed data (system documentation)

Part of the systemdokumentation (spec §3.1; BFNAR 2013:2 to be checked under V20). The seed lives in code at [`canisters/backend/accounting/src/lib/Seed.mo`](../../canisters/backend/accounting/src/lib/Seed.mo). Sources are listed in [sources.md](sources.md).

## How seeding works

- Seed version: `seed-2026.5` (history: .1 A2, .2 and .3 sales and purchases, .4 VAT boxes and import accounts, .5 payroll accounts and pay items). On every install or upgrade, if the stored version differs, missing accounts, VAT codes and series are **added**. Existing ones are never changed, because users may have edited them.
- Accounts can be added (non-BAS, `bas = false`) and renamed or deactivated in Ekonomi › Inställningar. Numbers never change, and no account is ever deleted.

## Series

| Code | Name | Used for |
|---|---|---|
| A | Manuella verifikationer | Manual vouchers |
| F | Kundfakturor | Sales invoices (A4) |
| L | Leverantörsfakturor | Supplier invoices (A5) |
| B | Bank | Bank transactions (A5) |
| P | Lön | Payroll (A7) |
| M | Moms | VAT settlement (A6) |
| X | Bokslut | Year-end (A9) |
| C | Rättelser | Correction vouchers (all corrections) |

## Numbering

- One counter per (series, fiscal year), starting at 1.
- A number is taken only inside the update that stores the voucher, with no await in between. A rejected voucher takes no number, and drafts never have one.
- The result is gapless numbering by construction, which the tests check.

## VAT codes

Each code has a return box: `boxBase` for accounts that carry the code, `boxVat` for the code's own VAT account. The full mapping is in [vat-boxes.md](vat-boxes.md). `seed-2026.4` filled the boxes on codes the earlier seeds created without them, and the VAT code on seeded purchase accounts that had none. Values a user has set are never changed.

| Code | Name | Rate | Kind | Account | Box base / VAT |
|---|---|---|---|---|---|
| U25 / U12 / U6 | Utgående moms 25 / 12 / 6 % | 25 / 12 / 6 % | outputDomestic | 2611 / 2621 / 2631 | 05 / 10, 11, 12 |
| I, IG, IU, IO | Ingående moms (2641, 2640, 2645, 2647) | – | inputDomestic | as named | – / 48 |
| OBP / OBP12 / OBP6 | Omvänd betalningsskyldighet, inköp 25 / 12 / 6 % | 25 / 12 / 6 % | reverseChargePurchase | 2614 / 2624 / 2634 | – / 30, 31, 32 |
| EUV, EUT, UTT, SEV, SET | Purchase bases: EU goods, EU services, non-EU services, SE goods RC, SE services RC | – | reverseChargePurchase | – (on 4515–4517, 4535–4537, 4531–4533, 4415–4417, 4425–4427) | 20, 21, 22, 23, 24 / – |
| IMP25 / IMP12 / IMP6 | Utgående moms import 25 / 12 / 6 % | 25 / 12 / 6 % | importVat | 2615 / 2625 / 2635 | – / 60, 61, 62 |
| EUVA | Varuförsäljning till annat EU-land | 0 | euGoodsSale | – (on 3108) | 35 / – |
| EXPV | Export av varor | 0 | exportGoods | – (on 3105) | 36 / – |
| EUTJ | Tjänsteförsäljning till annat EU-land | 0 | euServiceSale | – (on 3308) | 39 / – |
| EXPT | Tjänster till land utanför EU | 0 | exportServices | – (on 3305) | 40 / – |
| OMS | Försäljning, köparen betalningsskyldig i Sverige | 0 | buyerLiableSE | – (on 3231) | 41 / – |
| MF | Momsfri försäljning | 0 | exempt | – (on 3004) | 42 / – |

## Accounts

The 95 BAS 2026 accounts listed in `Seed.mo`, with names copied verbatim from BAS 2026 v1.1. The kind comes from the account class:
- 1xxx: asset
- 20xx: equity
- 21–29xx: liability
- 3xxx and 83xx: revenue
- all other accounts: expense

## Automatic postings and rules

- **Voucher rules:**
  - At least 2 and at most 500 lines.
  - No line can be zero, and the lines must sum to zero.
  - Accounts must be active, and VAT codes must exist.
  - The event date must fall in a fiscal year that is not locked and come after the lock date.
- **Corrections:** a correction voucher in series C references the original. If no lines are given, it reverses the original in full.
- **Retention:** each voucher's `retainUntil` is 31 Dec of the year 7 years after the fiscal year's end year.
- **Lock date:** it only moves forward, and never past today.
- **Fiscal years:**
  - A fiscal year covers whole months, normally 12. The first year, or a change of fiscal year, may run 1–18 months.
  - Each year starts the day after the previous one ends.
  - Status goes `open ⇄ closing → locked`, and years lock in order.
- **Audit log:** append-only, with a hash chain (`acj-1` + SHA-256). It covers every change, sign-in and key derivation.

## Pay items (lönearter)

Added when missing, like accounts. The AGI fields are in [agi-fields.md](agi-fields.md).

| Code | Name | Kind | Earns vacation pay | AGI | Account |
|---|---|---|---|---|---|
| LON / TIM / OT | Månadslön / Timlön / Övertid | cash | yes | 011 | 7210 |
| SJK / KAR | Sjuklön / Karensavdrag (negative) | cash | yes | 011 | 7281 |
| SEM | Semesterlön (från semesterlöneskuld) | cash | no | 011 | 2920 |
| SEMT | Semestertillägg | cash | no | 011 | 7285 |
| BIL | Bilförmån | benefit | no | 013 | – |
| KOST / FRM | Kostförmån / Övriga skattepliktiga förmåner | benefit | no | 012 | – |
| DRIV | Drivmedel vid bilförmån (marknadsvärde × 1,2) | benefit | no | 018 | – |
| MIL | Skattefri bilersättning | tax-free | no | 050 (ticked) | 7331 |
| TRA | Skattefritt traktamente | tax-free | no | 051 (ticked) | 7321 |
| NAVD | Nettolöneavdrag | net deduction | no | – | 2890 |

Benefits are not booked; they only raise tax and contributions. The pay run posts in series P:
- Pay items to their accounts.
- Tax to 2710.
- Contributions 7510 → 2731.
- Net pay to 2820.
- Vacation accrual (procentregeln) 7290 → 2920, with its contributions 7519 → 2941.

Payment posts 2820 → 1930 in series B.

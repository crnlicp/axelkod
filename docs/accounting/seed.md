# Accounting seed data (system documentation)

Part of the systemdokumentation (spec §3.1; BFNAR 2013:2 to be checked under V20). The seed lives in code at [`canisters/backend/accounting/src/lib/Seed.mo`](../../canisters/backend/accounting/src/lib/Seed.mo). Sources are listed in [sources.md](sources.md).

## How seeding works

- Seed version: `seed-2026.1`. On every install or upgrade, if the stored version differs, missing accounts, VAT codes and series are **added**. Existing ones are never changed, because users may have edited them.
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

Box numbers on the VAT return are not set yet (V3, phase A6).

| Code | Name | Rate | Kind | Account |
|---|---|---|---|---|
| U25 | Utgående moms 25 % | 25 % | outputDomestic | 2611 |
| U12 | Utgående moms 12 % | 12 % | outputDomestic | 2621 |
| U6 | Utgående moms 6 % | 6 % | outputDomestic | 2631 |
| I | Ingående moms | – | inputDomestic | 2641 |
| OBP | Omvänd betalningsskyldighet, inköp 25 % | 25 % | reverseChargePurchase | 2614 |
| EUVA | Varuförsäljning till annat EU-land | 0 | euGoodsSale | – |
| EUTJ | Tjänsteförsäljning till annat EU-land | 0 | euServiceSale | – |
| EXPV | Export av varor | 0 | exportGoods | – |
| EXPT | Tjänster till land utanför EU | 0 | exportServices | – |
| MF | Momsfri försäljning | 0 | exempt | – |

## Accounts

The 63 BAS 2026 accounts listed in `Seed.mo`, with names copied verbatim from BAS 2026 v1.1. The kind comes from the account class:
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

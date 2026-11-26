# BAS → SRU mapping (INK2R) and the K2 statements

Source: BAS "SRU-kopplingar/deklarationer", INK2 interval table `INK2_P1_intervall-241119.xlsx` (sources.md V15). Field codes and signs: Skatteverket INK2R/INK2S field lists 2026P4 (V16). The table is code in `app/admin/accounting/sru.ts` (`FIELDS`, `PAIRS`); this page explains the rules.

## How an account is reported

1. If the account has its own SRU code (Inställningar › Kontoplan), that field is used.
2. Otherwise the BAS ranges decide. 899x (Årets resultat) is not reported.
3. Some groups are reported on a + field when their net is income and on a − field when it is a cost:

| Accounts | + field | − field |
|---|---|---|
| 4900–4909, 4930–4959, 4970–4979, 4990–4999 | 7411 | 7510 |
| 8000–8069, 8090–8099 | 7414 | 7518 |
| 8100–8169, 8190–8199 (not 8113, 8118, 8123, 8133) | 7415 | 7519 |
| 8113, 8118, 8123, 8133 | 7423 | 7530 |
| 8200–8269, 8290–8299 | 7416 | 7520 |
| 8810 | 7420 | 7525 |
| 8850–8859 | 7421 | 7526 |
| 8860–8899 | 7422 | 7527 |

8819 always goes to 7420, 8811 to 7525 and 884x to 7527.

40xx–47xx appears in the BAS table under both 7511 (Råvaror och förnödenheter) and 7512 (Handelsvaror). The app uses 7511, because K2 puts material used in service work there. Give an account the SRU code 7512 if it holds goods bought for resale.

## Amounts

- Whole kronor, rounded half away from zero, per field.
- Balance-sheet fields (sign `*`): assets as debit balances, equity and liabilities as credit balances. A negative value is allowed (Numeriskt_A).
- Result fields: the form prints + or −. The amount is given positive, and negative only where it goes against the printed sign (for example a credit on a cost account).
- 3.26/3.27 (7450/7550) is the sum of the rounded result fields, so the form adds up.

## K2 statements

The income statement (cost by nature) and the balance sheet follow BFNAR 2016:10 4.4 and 4.7, built from the INK2R fields. Items with no amount in either year are left out (ÅRL 3:4). Before the closing voucher is posted, the year's result is shown as the open result. After it, the result is read from the income statement, and "Balanserat resultat" is free equity less that result.

## INK2S and INK2

These come from the stored tax calculation:

- 7650/7750: the book result.
- 7651: tax.
- 7653: non-deductible costs.
- 7654: schablonintäkt.
- 7754: tax-free income.
- 7663/7762: other adjustments.
- 7763: deficit brought forward.
- 7670/7770: the sum of those fields. It goes to INK2 7104/7114.

Not covered: koncernbidrag, delägarrätter, handelsbolag, fastighet, överavskrivningar, 8022 pension costs, and the consultant/audit questions (8040–8045). Fill these in by hand in the e-service when they apply.

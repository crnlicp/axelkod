# VAT return boxes (momsdeklaration)

Source: Skatteverket "Fylla i momsdeklarationen" and "Lämna momsdeklaration via fil i e-tjänsten" (V3 in [sources.md](sources.md), retrieved 2026-11-25). Implemented in `canisters/backend/accounting/src/lib/Vat.mo` and seeded in `lib/Seed.mo` (`seed-2026.4`).

## How a box gets its amount

The boxes come from the ledger, so manual vouchers count as well as sales, purchases and bank.

- **Base boxes:** an account carries a VAT code (`Account.vatCode`), and the code's `boxBase` names the box. The account's net movement in the period goes to that box.
- **VAT boxes:** a VAT code's own account (`VatCode.account`) reports to its `boxVat`.
- **Signs:** boxes 20–24, 48 and 50 count debits as positive. Every other box counts credits as positive, so credit notes reduce them.
- **Box 50:** the tax base from import documents (purchase treatment "Import (tullräkning)") dated in the period. Import VAT booked without such a document adds its base back from the rate.
- **Whole kronor:** öre are dropped in each box (truncated toward zero). Box 49 = 10 + 11 + 12 + 30 + 31 + 32 + 60 + 61 + 62 − 48, computed from those whole-kronor boxes. The dropped öre go to 3740 in the settlement. The rounding rule is an open item (V3).

## Mapping

| Box | Heading (Skatteverket) | XML element | VAT code → accounts (seed) |
|---|---|---|---|
| 05 | Momspliktig försäljning som inte ingår i fält 06, 07 eller 08 | ForsMomsEjAnnan | U25, U12, U6 base → 3001, 3002, 3003 |
| 06 | Momspliktiga uttag | UttagMoms | – |
| 07 | Beskattningsunderlag vid vinstmarginalbeskattning | UlagMargbesk | – |
| 08 | Hyresinkomster vid frivillig beskattning | HyrinkomstFriv | – |
| 10 / 11 / 12 | Utgående moms 25 / 12 / 6 % | MomsUtgHog / MomsUtgMedel / MomsUtgLag | U25 2611, U12 2621, U6 2631 |
| 20 | Inköp av varor från annat EU-land | InkopVaruAnnatEg | EUV → 4515–4517 |
| 21 | Inköp av tjänster från annat EU-land, enligt huvudregeln | InkopTjanstAnnatEg | EUT → 4535–4537 |
| 22 | Inköp av tjänster från land utanför EU | InkopTjanstUtomEg | UTT → 4531–4533 |
| 23 | Inköp av varor i Sverige som köparen är betalningsskyldig för | InkopVaruSverige | SEV → 4415–4417 |
| 24 | Övriga inköp av tjänster i Sverige som köparen är betalningsskyldig för | InkopTjanstSverige | SET → 4425–4427 |
| 30 / 31 / 32 | Utgående moms 25 / 12 / 6 % (on 20–24) | MomsInkopUtgHog / Medel / Lag | OBP 2614, OBP12 2624, OBP6 2634 |
| 35 | Försäljning av varor till annat EU-land | ForsVaruAnnatEg | EUVA → 3108 |
| 36 | Försäljning av varor utanför EU | ForsVaruUtomEg | EXPV → 3105 |
| 37 / 38 | Mellanmans inköp / försäljning vid trepartshandel | InkopVaruMellan3p / ForsVaruMellan3p | – (not supported in v1) |
| 39 | Försäljning av tjänster till beskattningsbar person i annat EU-land, enligt huvudregeln | ForsTjSkskAnnatEg | EUTJ → 3308 |
| 40 | Övrig försäljning av tjänster som tillhandahållits utomlands | ForsTjOvrUtomEg | EXPT → 3305 |
| 41 | Försäljning när köparen är betalningsskyldig i Sverige | ForsKopareSkskSverige | OMS → 3231 |
| 42 | Övrig försäljning med mera | ForsOvrigt | MF → 3004 |
| 50 | Beskattningsunderlag vid import | MomsUlagImport | import documents (see above) |
| 60 / 61 / 62 | Utgående moms 25 / 12 / 6 % (import) | MomsImportUtgHog / Medel / Lag | IMP25 2615, IMP12 2625, IMP6 2635 |
| 48 | Ingående moms att dra av | MomsIngAvdr | I 2641, IG 2640, IU 2645, IO 2647 |
| 49 | Moms att betala eller få tillbaka | MomsBetala | computed |

Accounts added by a user get a box by choosing a VAT code under Inställningar › Kontoplan. A revenue account with a balance in the period but no VAT code is flagged in the return's checks.

## Filing

1. **Lock:** in one update, the box values (whole kronor and öre), the count and hash of the source vouchers and a settlement voucher in series M are stored. The settlement is dated the period's last day and moves every VAT account to 2650, with the öre on 3740. The lock date then moves to the period end.
2. **File:** the eSKDUpload 6.0 file (ISO-8859-1) is built in the browser from the stored values and uploaded in the e-service "Lämna momsdeklaration › Deklarera via fil". Then mark the return filed, with an optional receipt.
3. **Pay:** link the booked tax-account VAT entry (1630 against 2650) with the amount of box 49.

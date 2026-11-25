# Accounting module: official sources

One row per verification item in [plan.md](plan.md#verification-register). An item is filled in before the phase that uses it, from the official source only. Record the exact page or document, the version or date it states, and the date it was retrieved. If a source changes, add a new row instead of editing the old one.

| # | Item | Source (URL, document, section) | Version / effective date | Retrieved | Notes |
|---|---|---|---|---|---|
| V1 | Mandatory invoice content | | | | |
| V2 | Simplified invoice limit, foreign-currency VAT in SEK wording | | | | |
| V3 | VAT return box list, file format, whether file upload still exists | | | | |
| V4 | EU sales list file format and deadlines | | | | |
| V5 | VIES REST API, and whether IC HTTPS outcalls can reach it (IPv4/IPv6) | | | | |
| V6 | VAT and AGI deadlines including the 17th exceptions; prepaid tax dates | | | | |
| V7 | AGI XML schema and current document version, field codes | | | | |
| V8 | Employer contribution rates 2026, youth reduction dates, rate and birth years | | | | |
| V9 | Växa-stöd as a refund application from 2026 | | | | |
| V10 | Tax tables open-data format | | | | |
| V11 | Mileage, per diem, PBB/IBB 2026, car benefit formula | | | | |
| V12 | ROT/RUT 2026 rates and caps, XML schema, decision JSON, 2027 fields | | | | |
| V13 | Riksbank reference rate history | | | | |
| V14 | Late-payment compensation and reminder-fee rules | | | | |
| V15 | BAS 2026 accounts and BAS → SRU (INK2R/INK2S) mapping | bas.se › Kontoplaner › "BAS 2026" (Fullständig), file `BAS_kontoplan_2026_v2.xlsx` (https://www.bas.se/wp-content/uploads/2026/04/BAS_kontoplan_2026_v2.xlsx) | Sheet header "KONTOPLAN BAS 2026 v 1.1" | 2026-11-25 | Accounts only (A2). The 63 seeded names (incl. 2641) are copied verbatim into `lib/Seed.mo`. 4598 (in the spec's list) is not in BAS 2026 and is not seeded. SRU mapping still open (A9). |
| V16 | SRU file format (`INFO.SRU`, `BLANKETTER.SRU`) | | | | |
| V17 | SIE 4C (type 4) spec | | | | |
| V18 | Peppol BIS Billing 3.0 rules and UBL schema | | | | |
| V19 | K2 layout (BFNAR 2016:10) for income statement and balance sheet | | | | |
| V20 | Bookkeeping, retention and storage rules (BFL 1999:1078, BFNAR 2013:2, 7 kap. storage abroad) | riksdagen.se, Bokföringslag (1999:1078) (https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/bokforingslag-19991078_sfs-1999-1078/) | "Ändrad: t.o.m. SFS 2024:342" | 2026-11-25 | Used: 3 kap. 1 § (12 months), 3 § (shorter or up to 18 months when the obligation starts or the year is changed); 5 kap. 2 § (cash by next working day, other events as soon as possible), 5 § (correction: when and by whom, easy to find), 6–7 §§ (voucher content and number); 7 kap. 2 § (kept through the 7th year after the calendar year the FY ended; in Sweden), 3 a § (other EU country if the location and every change is reported to Skatteverket, immediate electronic access, immediate printout in Sweden). BFNAR 2013:2 not yet read. |
| V21 | European subnet ID, node count and node countries | | | | |
| — | VAT rates 25 / 12 / 6 % (seeded VAT codes) | skatteverket.se "Momssatser och undantag från moms" (https://www.skatteverket.se/foretag/moms/saljavarorochtjanster/momssatspavarorochtjanster.4.58d555751259e4d66168000409.html) | Food 6 % from 2026-04-01 (no end date stated); dance events 6 % from 2026-07-01 | 2026-11-25 | Rates only. Box numbers wait for V3 (A6). |

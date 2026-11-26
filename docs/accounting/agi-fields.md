# Employer return (arbetsgivardeklaration, AGI)

Source: Skatteverket "Teknisk beskrivning (1.1.18.2)" with the annexes "Fältlista 1.1.18.1" and "Summering och Beräkningsregler", and XSDs `arbetsgivardeklaration_1.1.xsd` and `arbetsgivardeklaration_component_1.1.xsd` (V7 in [sources.md](sources.md), retrieved 2026-11-26). The XSDs and example file 15 are in `canisters/frontend/web/tests/fixtures/`.

## What a pay run reports

| Field | Element | Source in Axelkod | Pay items (seed) |
|---|---|---|---|
| 001 | AvdrPrelSkatt | Tax withheld on the payslip (whole kronor) | – |
| 011 | KontantErsattningUlagAG | Cash pay subject to employer contributions | LON, TIM, OT, SJK, KAR, SEM, SEMT |
| 012 | SkatteplOvrigaFormanerUlagAG | Other taxable benefits | KOST, FRM |
| 013 | SkatteplBilformanUlagAG | Car benefit (value entered) | BIL |
| 018 | DrivmVidBilformanUlagAG | Fuel benefit, market value × 1.2 | DRIV |
| 050 | Bilersattning | Ticked when tax-free mileage was paid | MIL |
| 051 | Traktamente | Ticked when a tax-free per diem was paid | TRA |
| 215 | BetalningsmottagarId | Personnummer, decrypted in the browser | – |
| 570 | Specifikationsnummer | The employee id (stable per employee) | – |
| 245 / 246 | ArbetsplatsensGatuadress / Ort | Employee's workplace, else the company address | – |

The HU (main record) carries 201 (`16` + org nr), 006 (YYYYMM, the payment month), 487 and 497.

## Sums

- **497** is the sum of 001.
- **487** follows Skatteverket's rule. Fee base AeIU = 011 + 012 + 013 − 019 + 018 / 1.2, per payee. The rate comes from the payee's birth year:
  - 31.42 % as standard.
  - 10.21 % for those who had turned 67 at the start of the year (2026: born 1938–1958).
  - 0 % for those born 1937 or earlier.
  - From 202604 to 202709, 20.81 % on the part up to 25 000 kr for those aged 18–22 at the start of the year (2026: born 2003–2007), and 31.42 % above it.
  - The fees are summed exactly and the öre are dropped. This reproduces example file 15 (487 = 18 881).
- **Booked fees:** the fees booked in the pay run are per payslip in öre. Skatteverket accepts a minor difference against its own calculation (control B_006).

## Not in v1

- Frånvarouppgift (absence records, 821–827).
- Corrections and removals (205).
- SINK / A-SINK.
- Seafarers.
- Foreign payees.
- Fields 019, 020, 030–039 and 131–138 (no pay items for them).

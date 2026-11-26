// Systemdokumentation (BFL 5 kap. 11 §, BFNAR 2013:2 kapitel 9; sources.md V20) as a PDF,
// built from the current settings, chart of accounts, VAT codes, series and audit log.
// Swedish only, like the other legal documents.
import type { AuditEntry } from "../../bindings/accounting";
import { formatOre } from "./money";
import type { MasterData } from "./context";
import type { DocSection, Job, Meta } from "./pdf/types";

const KIND: Record<string, string> = { asset: "Tillgång", liability: "Skuld", equity: "Eget kapital", revenue: "Intäkt", expense: "Kostnad" };

/** What each series is used for (9.6). */
const SERIES_USE: Record<string, string> = {
  A: "Manuella verifikationer och ingående balanser som bokförs för hand.",
  F: "Kundfakturor och kreditfakturor när de utfärdas; kundinbetalningar och påminnelseavgifter.",
  L: "Leverantörsfakturor och kvitton när de bokförs från inkorgen.",
  B: "Bankhändelser: betalningar som matchas mot fakturor, nettolön och skattekontot.",
  P: "Lönekörningar (bruttolön, skatt, arbetsgivaravgifter).",
  M: "Momsdeklarationer: omföring av momskonton till 2650 per period.",
  X: "Bokslut: periodiseringsfond, skatt, årets resultat och poster enligt kontantmetoden vid årets slut.",
  C: "Rättelser. Varje rättelse hänvisar till den verifikation den rättar (BFL 5 kap. 5 §).",
  I: "Avskrivningar, avyttring av inventarier och lagerförändring.",
};

/** Behandlingsregler that create postings (9.9–9.10). */
const RULES: [string, string][] = [
  ["Kundfaktura (F)", "Debet 1510 Kundfordringar med fakturans total; kredit intäktskontot per rad och utgående moms 26xx per momskod (U25 2611, U12 2621, U6 2631). Omvänd moms och EU/export utan moms med rutor enligt momskoden. ROT/RUT: skattereduktionen debiteras 1513."],
  ["Kreditfaktura (F)", "Samma konton som originalfakturan med omvänt tecken."],
  ["Kundinbetalning (B/F)", "Debet bankkontot (1930), kredit 1510."],
  ["Leverantörsfaktura och kvitto (L)", "Kredit 2440 Leverantörsskulder (eller betalkontot för kvitton); debet kostnadskonto per rad och ingående moms 2641. Omvänd betalningsskyldighet och import: beräknad utgående moms (2614/2624/2634, 2615/2625/2635) och ingående moms (2645/2647)."],
  ["Leverantörsbetalning (B)", "Debet 2440, kredit 1930."],
  ["Bankimport (B)", "Rader från bankens fil matchas mot öppna fakturor eller enligt sparade regler; varje matchning blir en verifikation. Dubbletter spärras med en nyckel per rad."],
  ["Skattekonto (B)", "Händelser på skattekontot (1630) mot 2518, 2650, 2710, 2731, ränta 8314 (skattefri) och 8423 (ej avdragsgill)."],
  ["Momsdeklaration (M)", "Momskontona 26xx förs över till 2650 Redovisningskonto för moms per period; öresavrundning 3740."],
  ["Lön (P, B)", "Debet lönekostnadskonto enligt löneart och arbetsgivaravgifter 7510; kredit 2710 Personalskatt, 2731 Arbetsgivaravgifter och 2820 Löneskulder. Nettolönen betalas 2820 mot 1930. Semesterlöneskuld 2920/7290."],
  ["Avskrivning (I)", "Linjär plan per månad: debet avskrivningskonto, kredit ackumulerade avskrivningar, enligt tillgångens kontoval. Avyttring: anskaffningsvärde och avskrivningar bort, vinst 3973 eller förlust 7973."],
  ["Lager (I)", "Lagerförändring vid inventering: 1460 mot 4960 (lägsta värdets princip, FIFO, ev. 97 %-regeln)."],
  ["Bokslut (X)", "Återföring av periodiseringsfond (21xx mot 8819), avsättning (8811 mot 2120 + år mod 10), skatt (8910 mot 2512), årets resultat (8999 mot 2099). Kontantmetoden: obetalda fakturor bokas sista dagen och vänds första dagen nästa år. Överföring till nästa år: utgående balanser blir ingående, 2099 förs till 2098."],
  ["Rättelse (C)", "Ny verifikation som återför felet och bokför rätt; originalet ändras aldrig och visar vem som rättat och när."],
];

const DATE = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Stockholm" });
export const auditTime = (e: Pick<AuditEntry, "at">) => DATE.format(new Date(Number(e.at / 1_000_000n)));

export function sysdocJob(meta: Meta, data: MasterData, audit: { total: number; intact: boolean | null; first: AuditEntry | null }): Job {
  const s = data.settings;
  const sections: DocSection[] = [
    { title: "1. Om dokumentet", text: [
      "Systemdokumentationen beskriver hur bokföringssystemet är uppbyggt och fungerar, enligt bokföringslagen 5 kap. 11 § och BFNAR 2013:2 kapitel 9. Den skapas ur systemets aktuella inställningar varje gång den hämtas.",
    ], facts: [
      ["Företag", `${data.company?.legalName ?? ""} (${data.company?.orgNr ?? ""})`],
      ["System", "Axelkod Ekonomi på Internet Computer"],
      ["Bokföringsmetod", s.accountingMethod === "cash" ? "Kontantmetoden" : "Faktureringsmetoden"],
      ["Momsperiod", s.vatPeriod === "month" ? "Månad" : s.vatPeriod === "quarter" ? "Kvartal" : "Helår"],
      ["Moduler", [s.modules.payroll && "Lön", s.modules.rotRut && "ROT/RUT", s.modules.inventory && "Lager"].filter(Boolean).join(", ") || "Inga tillval"],
      ["Låsdatum", data.lockDate ?? "Inget"],
    ] },
    { title: "2. Systemets uppbyggnad och informationsflöden (samlingsplan)", text: [
      "Systemet består av tre delar. Webbläsaren visar sidorna, tar emot inmatning och skapar alla rapporter och filer (PDF, XML, SRU, SIE4, CSV) från lagrade uppgifter. Kanistern accounting lagrar kontoplan, räkenskapsår, verifikationer, register och behandlingshistorik, och kontrollerar behörighet och regler. Kanistern vault lagrar mottagna underlag krypterade. Ingen genererad fil lagras.",
      "Flöden: inmatning och uppladdning i webbläsaren → kontroll och lagring i accounting → verifikation i grundboken → huvudbok, råbalans, momsdeklaration, bokslut. Underlag krypteras i webbläsaren med en nyckel per fil (AES-256-GCM) som i sin tur krypteras med en vetKey; vault ser bara krypterad data. Personnummer, privatpersoners adresser och anställdas bankkonton krypteras på samma sätt (pii-v1).",
      "Filer till Skatteverket (momsdeklaration, periodisk sammanställning, arbetsgivardeklaration, ROT/RUT, INK2/SRU) skapas i webbläsaren och laddas upp av användaren i Skatteverkets e-tjänster.",
    ] },
    { title: "3. Räkenskapsår", table: { cols: ["Start", "Slut", "Status"], rows: data.years.map((y) => [y.start, y.end, y.status === "open" ? "Öppet" : y.status === "closing" ? "Bokslut pågår" : "Låst"]) } },
    { title: "4. Verifikationsserier och identifiering (9.6)", text: [
      "Varje verifikation får ett löpnummer per serie och räkenskapsår, utan luckor, i den ordning den bokförs. Den identifieras som serie-nummer (t.ex. A-12) inom räkenskapsåret. En bokförd verifikation kan aldrig ändras eller tas bort.",
    ], table: { cols: ["Serie", "Namn", "Används för"], widths: [1, 3, 8], rows: data.series.map((x) => [x.code, x.name, SERIES_USE[x.code] ?? ""]) } },
    { title: "5. Verifieringskedjor (9.7–9.8)", text: [
      "Fakturor, leverantörsfakturor, lönekörningar, momsdeklarationer, avskrivningar och bokslut har egna nummer och hänvisar till verifikationen de skapat; verifikationen visar sin källa. Underlag kopplas till verifikationen och listas på den. Utfärdade fakturor har en kontrollsumma (SHA-256) över innehållet som visas på dokumentet. Från verifikationen nås grundbok, huvudbok och årsbokslut, och omvänt.",
    ] },
    { title: "6. Behandlingsregler och automatiska konteringar (9.9–9.10)", facts: RULES },
    { title: "7. Hur kontona sammanställs i årsbokslutet (9.2 b)", text: [
      "Resultat- och balansräkningen ställs upp enligt K2 (BFNAR 2016:10) och INK2R/INK2S via BAS-kontoplanens SRU-koppling; ett konto med egen SRU-kod i kontoplanen följer den. Skatteberäkning, periodiseringsfond och bokslutsverifikation beskrivs i avsnitt 6.",
    ] },
    { title: "8. Momskoder", table: {
      cols: ["Kod", "Namn", "Sats", "Konto", "Ruta underlag", "Ruta moms"], widths: [1.2, 5, 1, 1, 1.4, 1.4],
      rows: data.vatCodes.map((c) => [c.code, c.name, `${Number(c.rateBp) / 100} %`, c.account ? String(c.account) : "", c.boxBase ? String(c.boxBase) : "", c.boxVat ? String(c.boxVat) : ""]),
    } },
    { title: "9. Kontoplan (9.2 a, 9.3)", text: [
      "Kontoplanen bygger på BAS. Konton som har använts kan inaktiveras men inte tas bort. Egna konton är markerade.",
    ], table: {
      cols: ["Konto", "Benämning", "Typ", "Moms", "SRU", "Status"], widths: [1, 6, 1.6, 1, 1, 1.4],
      rows: [...data.accounts].sort((a, b) => Number(a.number - b.number)).map((a) => [String(a.number), a.name, KIND[a.kind] ?? "", a.vatCode ?? "", a.sruCode ?? "", `${a.active ? "Aktiv" : "Inaktiv"}${a.bas ? "" : ", eget"}`]),
    } },
    { title: "10. Behandlingshistorik (9.15–9.16)", text: [
      "Varje registrering och ändring (bokföring, rättelse, utfärdande, inställningar, roller, låsning, export och återställning) skrivs i behandlingshistoriken i kanistern accounting med tidpunkt och användare. Posterna kan bara läggas till; varje post innehåller kontrollsumman av den föregående (SHA-256), så en ändring eller borttagning i efterhand bryter kedjan. Historiken visas, kontrolleras och skrivs ut under Rapporter & export.",
    ], facts: [
      ["Antal poster", String(audit.total)],
      ["Kedjan", audit.intact === null ? "Inte kontrollerad" : audit.intact ? "Hel" : "Bruten"],
      ["Första post", audit.first ? auditTime(audit.first) : "–"],
    ] },
    { title: "11. Arkivering och arkivplan (8.2–8.3)", text: [
      "Räkenskapsinformationen (verifikationer, underlag, register, behandlingshistorik och systemdokumentation) lagras elektroniskt i kanistrarna accounting och vault på Internet Computer. Varje verifikation och underlag sparas till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades (BFL 7 kap. 2 §); datumet visas på verifikationen.",
      "Säkerhetskopior tas av ägaren under Inställningar › Säkerhetskopia: en krypterad fil med alla register, dekrypterade underlag och personuppgifter, SIE4 per år och en manifestfil med kontrollsummor. Kopian förvaras i Sverige och skild från originalet. Uttaget av en kopia skrivs i behandlingshistoriken.",
      `Lagringsplats anmäld till Skatteverket: ${s.storageNotice ? `ja, ${s.storageNotice.date} (${s.storageNotice.location})` : "inte registrerad i systemet"}.`,
    ] },
    { title: "12. Läsbar form och utskrift (9.12)", text: [
      "All räkenskapsinformation kan visas på skärmen och skrivas ut som PDF: verifikationer med underlagslista, grundbok, huvudbok, råbalans, reskontror, momsdeklaration, lönebesked, anläggningsregister, resultat- och balansräkning och behandlingshistorik. Underlagen visas och laddas ner i sin ursprungliga form (PDF eller bild). Hela bokföringen kan exporteras som SIE4 (SIE 4C, typ 4E) och läsas i andra bokföringsprogram.",
    ] },
    { title: "13. Versioner", facts: [
      ["Kontoplan och momskoder", "BAS 2026"],
      ["Dokumentmallar", "Faktura, kreditfaktura, offert, påminnelse, verifikation, grundbok, huvudbok, råbalans, momsdeklaration, lönebesked, resultat- och balansräkning: version 1 (en ändrad mall blir en ny version; gamla dokument visas med sin mall)"],
      ["Filformat", "SIE 4C (2025-08-06), SRU 2026P4, momsdeklaration eSKDUpload, arbetsgivardeklaration 1.1, ROT/RUT enligt Skatteverkets schema"],
      ["Belopp", `I öre utan avrundning; exempel ${formatOre(123456n)} kr`],
    ] },
  ];
  return { template: "document@1", meta, sections };
}

// Ekonomi › Dokumentation: what each section is for, how to work in it, and the accounting
// flow from setup to year-end. The texts live here so only this route loads them.
import { Link } from "react-router";
import { useAdminLang } from "../../../admin/i18n";
import { useAcc } from "../../../admin/accounting/context";
import { useCrumbs } from "../../../admin/accounting/crumbs";
import { PageHead } from "../../../admin/accounting/ui/kit";

type Section = { id: string; title: string; to?: string; body: string[]; steps?: string[] };
type Guide = { title: string; intro: string; toc: string; open: string; flowTitle: string; flow: { when: string; items: string[] }[]; sections: Section[]; rulesTitle: string; rules: string[] };

const sv: Guide = {
  title: "Dokumentation",
  intro: "Så är Ekonomi uppbyggt och så arbetar du i det. Allt som bokförs blir en verifikation med löpnummer i en serie. En bokförd verifikation ändras aldrig: fel rättas med en ny verifikation. Dokument som fakturor och filer till Skatteverket skapas i webbläsaren när du behöver dem.",
  toc: "Innehåll", open: "Öppna",
  flowTitle: "Arbetsflödet",
  flow: [
    { when: "En gång", items: [
      "Kör installationsguiden: företagets uppgifter, räkenskapsår, bokföringsmetod (faktura- eller kontantmetoden) och momsperiod.",
      "Lägg till användare och roller under Inställningar › Användare, och en reservägare.",
      "Slå på de moduler du behöver (Lön, ROT/RUT, Lager) under Inställningar › Bokföring.",
      "Anmäl var räkenskapsinformationen lagras till Skatteverket (checklistan i guiden).",
    ] },
    { when: "Löpande (dagligen eller veckovis)", items: [
      "Skapa offerter och fakturor under Försäljning. Fakturan bokförs när den utfärdas (fakturametoden).",
      "Ladda upp leverantörsfakturor och kvitton i Inköp › Att bokföra och bokför dem i arbetsbänken.",
      "Importera bankens kontoutdrag (CSV) och matcha transaktionerna mot fakturor, inköp och regler.",
      "Registrera betalningar som inte kom via banken, och skicka påminnelser på förfallna fakturor.",
    ] },
    { when: "Varje månad", items: [
      "Lön: skapa lönekörningen, för in underlag, beräkna, granska, godkänn och markera utbetald. Lämna arbetsgivardeklarationen (AGI) senast den 12:e (17:e i januari och augusti).",
      "Kör avskrivningar för månaden under Tillgångar & lager.",
      "Stäm av bank (1930) och skattekonto (1630) mot saldona hos banken och Skatteverket.",
    ] },
    { when: "Varje momsperiod", items: [
      "Moms: kontrollera perioden, lås den och bokför avräkningen, ladda ner filen och lämna den i Skatteverkets e-tjänst, markera inlämnad och registrera betalningen.",
      "Periodisk sammanställning för EU-försäljning senast den 25:e.",
      "ROT/RUT: skapa ärenden för betalda fakturor och en begäran senast 31 januari året efter betalningen.",
    ] },
    { when: "Vid årets slut", items: [
      "Inventera lagret och bokför inventeringen per sista dagen i räkenskapsåret.",
      "Kör årets sista avskrivningar.",
      "Bokslut, årsredovisning (K2), INK2 och SIE4 kommer i nästa del (A9b–c).",
    ] },
  ],
  sections: [
    { id: "overview", title: "Översikt", to: "/admin/accounting", body: ["Nyckeltal för året, intäkter och kostnader per månad och kommande deadlines. Klockan i sidhuvudet visar deadlines inom 14 dagar."] },
    { id: "sales", title: "Försäljning", to: "/admin/accounting/sales", body: [
      "Kunder och artiklar, offerter, fakturor, kreditfakturor, betalningar och påminnelser.",
      "Välj kund först: kunden styr språk, villkor och momsbehandling. Kontrollera visar totalsummor, lagtexter och den verifikation som skapas. Utfärda ger fakturan ett nummer och låser innehållet (PDF:en skapas alltid från den sparade fakturan).",
      "Rättelse görs med en kreditfaktura, aldrig genom att ändra fakturan. Påminnelseavgift tas bara ut om den avtalats; förseningsersättning 450 kr gäller företagskunder.",
    ], steps: ["Ny faktura", "Välj kund", "Rader", "Kontrollera", "Utfärda", "Ladda ner PDF eller Peppol-fil"] },
    { id: "purchases", title: "Inköp", to: "/admin/accounting/purchases", body: [
      "Ladda upp eller fota underlag. Varje fil blir ett kort i Att bokföra. I arbetsbänken väljer du leverantör, konto och moms (även EU-köp och omvänd skattskyldighet) och bokför.",
      "Underlagen sparas krypterade i dokumentvalvet och kopplas till verifikationen.",
    ] },
    { id: "bank", title: "Bank & skattekonto", to: "/admin/accounting/bank", body: [
      "Importera bankens CSV-fil (kolumnerna sparas per bank). Matchning föreslås via OCR, belopp och datum och dina regler. Skattekontot importeras från Skatteverkets e-tjänst och stäms av mot 1630.",
    ] },
    { id: "ledger", title: "Bokföring", to: "/admin/accounting/ledger", body: [
      "Alla verifikationer, utkast, grundbok, huvudbok och saldobalans. Manuella verifikationer skrivs i debet- och kreditkolumner och måste balansera.",
      "Serier: A manuella, F kundfakturor, L leverantörsfakturor, B bank, P lön, M moms, I inventarier och lager, X bokslut, C rättelser.",
      "Rätta skapar en omvänd verifikation och en ny. Låsdatum (Inställningar) stoppar bokföring bakåt i tiden.",
    ] },
    { id: "vat", title: "Moms", to: "/admin/accounting/vat", body: [
      "Rutorna räknas fram ur bokföringen via kontonas momskoder. Stegen: Kontrollera → Lås och bokför avräkning → Ladda ner fil → Markera inlämnad → Registrera betalning. Låsning går först när perioden har slutat.",
    ] },
    { id: "payroll", title: "Lön", to: "/admin/accounting/payroll", body: [
      "Anställda (personuppgifter krypteras), skattetabeller, lönekörningar, lönespecifikationer, AGI-fil och växa-stöd. Visas när modulen Lön är påslagen.",
    ], steps: ["Period", "Underlag", "Beräkna", "Granska", "Godkänn", "Utbetald", "AGI"] },
    { id: "rotrut", title: "ROT/RUT", to: "/admin/accounting/rot-rut", body: [
      "Skattereduktion på faktura till privatperson. Köparens personnummer krypteras i webbläsaren. När kunden har betalat skapas ett ärende; ärenden samlas i en begäran (XML-fil till Skatteverket), och beslutet bokförs.",
    ] },
    { id: "assets", title: "Tillgångar & lager", to: "/admin/accounting/assets", body: [
      "Inventarier bokförs som inköp på tillgångskontot och läggs sedan upp i registret. Avskrivning sker linjärt per månad från månaden tillgången tas i bruk; kör avskrivningar per period. Under ett halvt prisbasbelopp får inköpet kostnadsföras direkt.",
      "Lager (modul): lagerartiklar och rörelser håller antal och anskaffningspris. Vid inventeringen värderas lagret enligt först in, först ut och lägsta värdets princip (valfritt 97 %), och lagerförändringen bokförs.",
    ] },
    { id: "settings", title: "Inställningar", to: "/admin/accounting/settings", body: [
      "Företag (uppgifterna på alla dokument), bokföring (metod, räkenskapsår, låsdatum, moduler), kontoplan, momskoder, fakturering, lön, användare och roller, säkerhet.",
    ] },
  ],
  rulesTitle: "Roller",
  rules: [
    "Ägare: allt, även användare och parametrar.",
    "Bokförare: bokföring, försäljning, inköp, bank, moms, ROT/RUT och tillgångar.",
    "Lön: löner och AGI.",
    "Revisor: läser allt men kan inte ändra något.",
  ],
};

const en: Guide = {
  title: "Documentation",
  intro: "How Accounting is organised and how to work in it. Everything that is booked becomes a voucher with a running number in a series. A booked voucher never changes: mistakes are corrected with a new voucher. Documents such as invoices and files for Skatteverket are created in the browser when you need them.",
  toc: "Contents", open: "Open",
  flowTitle: "The workflow",
  flow: [
    { when: "Once", items: [
      "Run the setup guide: company details, financial year, accounting method (invoice or cash) and VAT period.",
      "Add users and roles under Settings › Users, and a backup owner.",
      "Turn on the modules you need (Payroll, ROT/RUT, Inventory) under Settings › Bookkeeping.",
      "Report where the accounting records are stored to Skatteverket (the checklist in the guide).",
    ] },
    { when: "Ongoing (daily or weekly)", items: [
      "Create quotes and invoices under Sales. The invoice is booked when it is issued (invoice method).",
      "Upload supplier invoices and receipts in Purchases › To book and book them in the workbench.",
      "Import the bank statement (CSV) and match the transactions to invoices, purchases and rules.",
      "Register payments that did not come through the bank, and send reminders for overdue invoices.",
    ] },
    { when: "Every month", items: [
      "Payroll: create the pay run, enter the basis, calculate, review, approve and mark as paid. File the employer return (AGI) by the 12th (17th in January and August).",
      "Run depreciation for the month under Assets & inventory.",
      "Reconcile the bank (1930) and the tax account (1630) with the balances at the bank and Skatteverket.",
    ] },
    { when: "Every VAT period", items: [
      "VAT: check the period, lock it and book the settlement, download the file and file it in Skatteverket's e-service, mark it as filed and register the payment.",
      "EU sales list by the 25th.",
      "ROT/RUT: create cases for paid invoices and a claim by 31 January of the year after payment.",
    ] },
    { when: "At year-end", items: [
      "Count the inventory and book the stocktaking on the last day of the financial year.",
      "Run the year's last depreciation.",
      "Year-end closing, annual report (K2), INK2 and SIE4 come in the next part (A9b–c).",
    ] },
  ],
  sections: [
    { id: "overview", title: "Overview", to: "/admin/accounting", body: ["Key figures for the year, revenue and costs per month and upcoming deadlines. The bell in the header shows deadlines within 14 days."] },
    { id: "sales", title: "Sales", to: "/admin/accounting/sales", body: [
      "Customers and items, quotes, invoices, credit notes, payments and reminders.",
      "Choose the customer first: it sets language, terms and VAT treatment. Check shows the totals, legal notes and the voucher that will be created. Issue gives the invoice its number and locks the content (the PDF is always made from the stored invoice).",
      "Corrections are made with a credit note, never by changing the invoice. A reminder fee is charged only when agreed; the 450 kr late-payment compensation applies to business customers.",
    ], steps: ["New invoice", "Choose customer", "Lines", "Check", "Issue", "Download PDF or Peppol file"] },
    { id: "purchases", title: "Purchases", to: "/admin/accounting/purchases", body: [
      "Upload or photograph documents. Each file becomes a card in To book. In the workbench you choose supplier, account and VAT (including EU purchases and reverse charge) and book it.",
      "Documents are stored encrypted in the vault and linked to the voucher.",
    ] },
    { id: "bank", title: "Bank & tax account", to: "/admin/accounting/bank", body: [
      "Import the bank's CSV file (the columns are remembered per bank). Matches are suggested by OCR, amount and date and your rules. The tax account is imported from Skatteverket's e-service and reconciled with 1630.",
    ] },
    { id: "ledger", title: "Bookkeeping", to: "/admin/accounting/ledger", body: [
      "All vouchers, drafts, journal, general ledger and trial balance. Manual vouchers are entered in debit and credit columns and must balance.",
      "Series: A manual, F customer invoices, L supplier invoices, B bank, P payroll, M VAT, I assets and inventory, X year-end, C corrections.",
      "Correct creates a reversing voucher and a new one. The lock date (Settings) stops booking back in time.",
    ] },
    { id: "vat", title: "VAT", to: "/admin/accounting/vat", body: [
      "The boxes are computed from the ledger through the accounts' VAT codes. Steps: Check → Lock and book settlement → Download file → Mark as filed → Register payment. Locking is possible once the period has ended.",
    ] },
    { id: "payroll", title: "Payroll", to: "/admin/accounting/payroll", body: [
      "Employees (personal data is encrypted), tax tables, pay runs, payslips, the AGI file and växa-stöd. Shown when the Payroll module is on.",
    ], steps: ["Period", "Basis", "Calculate", "Review", "Approve", "Paid", "AGI"] },
    { id: "rotrut", title: "ROT/RUT", to: "/admin/accounting/rot-rut", body: [
      "Tax reduction on an invoice to a private person. The buyer's personal identity number is encrypted in the browser. Once the customer has paid, a case is created; cases are collected in a claim (an XML file for Skatteverket), and the decision is booked.",
    ] },
    { id: "assets", title: "Assets & inventory", to: "/admin/accounting/assets", body: [
      "Equipment is booked as a purchase on the asset account and then added to the register. Depreciation is straight-line per month from the month the asset is taken into use; run it per period. Below half a price base amount the purchase may be expensed directly.",
      "Inventory (module): stock items and moves keep quantities and costs. At the stocktaking the stock is valued first in, first out and at the lower of cost and net realisable value (optionally 97 %), and the change in stock is booked.",
    ] },
    { id: "settings", title: "Settings", to: "/admin/accounting/settings", body: [
      "Company (the details on every document), bookkeeping (method, financial years, lock date, modules), chart of accounts, VAT codes, invoicing, payroll, users and roles, security.",
    ] },
  ],
  rulesTitle: "Roles",
  rules: [
    "Owner: everything, including users and parameters.",
    "Bookkeeper: bookkeeping, sales, purchases, bank, VAT, ROT/RUT and assets.",
    "Payroll: payroll and AGI.",
    "Auditor: reads everything but cannot change anything.",
  ],
};

export default function AccountingGuide() {
  const { lang } = useAdminLang();
  const g = lang === "en" ? en : sv;
  const { href } = useAcc();
  useCrumbs([{ label: g.title }]);
  return (
    <>
      <PageHead title={g.title} />
      <p className="mb-6 max-w-3xl text-muted">{g.intro}</p>
      <nav aria-labelledby="guide-toc" className="card mb-8">
        <h2 id="guide-toc" className="mb-2 text-lg">{g.toc}</h2>
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          <li><a href="#flow">{g.flowTitle}</a></li>
          {g.sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
          <li><a href="#roles">{g.rulesTitle}</a></li>
        </ul>
      </nav>

      <section id="flow" aria-labelledby="flow-h" className="mb-10 scroll-mt-24">
        <h2 id="flow-h" className="mb-4 text-2xl">{g.flowTitle}</h2>
        <ol className="space-y-4">
          {g.flow.map((f, i) => (
            <li key={f.when} className="card">
              <h3 className="mb-2 flex items-center gap-3 text-lg">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-accent text-sm text-accent" aria-hidden="true">{i + 1}</span>{f.when}
              </h3>
              <ul className="ml-11 list-disc space-y-1">{f.items.map((x) => <li key={x}>{x}</li>)}</ul>
            </li>
          ))}
        </ol>
      </section>

      <div className="space-y-6">
        {g.sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="card scroll-mt-24">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id={`${s.id}-h`} className="text-2xl">{s.title}</h2>
              {s.to && <Link to={href(s.to)} className="text-sm">{g.open} {s.title}</Link>}
            </div>
            {s.body.map((p) => <p key={p} className="mb-2 max-w-3xl">{p}</p>)}
            {s.steps && (
              <ol className="mt-3 flex flex-wrap gap-2 text-sm" aria-label={s.title}>
                {s.steps.map((x, i) => <li key={x} className="rounded-full border border-border px-3 py-1"><span className="text-muted">{i + 1}.</span> {x}</li>)}
              </ol>
            )}
          </section>
        ))}
        <section id="roles" aria-labelledby="roles-h" className="card scroll-mt-24">
          <h2 id="roles-h" className="mb-2 text-2xl">{g.rulesTitle}</h2>
          <ul className="list-disc space-y-1 pl-5">{g.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      </div>
    </>
  );
}

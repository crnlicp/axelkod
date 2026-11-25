// Peppol BIS Billing 3.0 (UBL 2.1) from an issued snapshot (V18). Element order follows
// the UBL 2.1 schemas; tests validate against them and check the Swedish SE-R rules.
import type { Snapshot } from "../../bindings/accounting";

export const CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
export const PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

export class PeppolError extends Error {}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const el = (name: string, value: string, attrs: Record<string, string> = {}) =>
  `<${name}${Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("")}>${esc(value)}</${name}>`;
const wrap = (name: string, ...children: (string | false | undefined)[]) => `<${name}>${children.filter(Boolean).join("")}</${name}>`;

/** Minor units → "1234.56" (two decimals, as UBL amounts). */
const amt = (v: bigint) => {
  const neg = v < 0n;
  const a = neg ? -v : v;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
};
const money = (name: string, v: bigint, cur: string) => el(name, amt(v), { currencyID: cur });
const qty = (q: bigint) => { const s = `${q / 1000n}.${String(q % 1000n).padStart(3, "0")}`.replace(/\.?0+$/, ""); return s || "0"; };
const pct = (bp: bigint) => (Number(bp) / 100).toString();

/** UN/ECE Recommendation 20 codes for the units used on invoices. */
export function unitCode(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (["h", "tim", "timme", "timmar", "hour", "hours"].includes(u)) return "HUR";
  if (["st", "styck", "pcs", "pc", "ea"].includes(u)) return "H87";
  if (["dag", "dagar", "day", "days"].includes(u)) return "DAY";
  if (["mån", "månad", "month"].includes(u)) return "MON";
  if (u === "kg") return "KGM";
  if (u === "m") return "MTR";
  return "C62";
}

/** EAS 0007 (Swedish organisationsnummer) from "556036-0793"; or a stored "scheme:id" Peppol ID. */
function endpoint(peppolId: string | undefined, orgNr: string | undefined, country: string): { scheme: string; id: string } {
  const m = peppolId && /^(\d{4}):(.+)$/.exec(peppolId.trim());
  if (m) return { scheme: m[1], id: m[2] };
  if (orgNr && country === "SE") return { scheme: "0007", id: orgNr.replace(/\D/g, "") };
  throw new PeppolError("endpoint");
}

const EXEMPTION: Record<string, string> = { AE: "VATEX-EU-AE", K: "VATEX-EU-IC", G: "VATEX-EU-G", O: "VATEX-EU-O" };

function taxCategory(tag: "cac:TaxCategory" | "cac:ClassifiedTaxCategory", category: string, rateBp: bigint, reason?: string) {
  return wrap(tag,
    el("cbc:ID", category),
    category !== "O" && el("cbc:Percent", pct(rateBp)),
    tag === "cac:TaxCategory" && EXEMPTION[category] && el("cbc:TaxExemptionReasonCode", EXEMPTION[category]),
    tag === "cac:TaxCategory" && category === "E" && el("cbc:TaxExemptionReason", reason ?? "Exempt"),
    wrap("cac:TaxScheme", el("cbc:ID", "VAT")));
}

export function toUbl(x: Snapshot): string {
  if (x.kind === "quote") throw new PeppolError("kind");
  const credit = x.kind === "creditNote";
  const cur = x.currency;
  const s = x.seller;
  const b = x.buyer;
  const sellerEp = endpoint(s.peppolId, s.orgNr, s.country);
  const buyerEp = endpoint(b.peppolId, b.orgNr, b.address.country);
  const root = credit ? "CreditNote" : "Invoice";
  const ns = `urn:oasis:names:specification:ubl:schema:xsd:${root}-2`;

  const address = (street: string, city: string, zip: string, country: string) =>
    wrap("cac:PostalAddress", el("cbc:StreetName", street), el("cbc:CityName", city), el("cbc:PostalZone", zip), wrap("cac:Country", el("cbc:IdentificationCode", country)));

  const supplier = wrap("cac:AccountingSupplierParty", wrap("cac:Party",
    el("cbc:EndpointID", sellerEp.id, { schemeID: sellerEp.scheme }),
    wrap("cac:PartyName", el("cbc:Name", s.legalName)),
    address(s.street, s.city, s.postalCode, s.country),
    wrap("cac:PartyTaxScheme", el("cbc:CompanyID", s.vatNr), wrap("cac:TaxScheme", el("cbc:ID", "VAT"))),
    // SE-R-005: a Swedish seller states F-tax approval as a second tax scheme.
    s.fSkatt && wrap("cac:PartyTaxScheme", el("cbc:CompanyID", "Godkänd för F-skatt"), wrap("cac:TaxScheme", el("cbc:ID", "TAX"))),
    wrap("cac:PartyLegalEntity", el("cbc:RegistrationName", s.legalName), el("cbc:CompanyID", s.orgNr.replace(/\D/g, ""), { schemeID: "0007" }),
      el("cbc:CompanyLegalForm", `Säte ${s.registeredOffice}`)),
    wrap("cac:Contact", el("cbc:ElectronicMail", s.email)),
  ));

  const customer = wrap("cac:AccountingCustomerParty", wrap("cac:Party",
    el("cbc:EndpointID", buyerEp.id, { schemeID: buyerEp.scheme }),
    wrap("cac:PartyName", el("cbc:Name", b.name)),
    address(b.address.street, b.address.city, b.address.postalCode, b.address.country),
    b.vatNr && wrap("cac:PartyTaxScheme", el("cbc:CompanyID", b.vatNr), wrap("cac:TaxScheme", el("cbc:ID", "VAT"))),
    wrap("cac:PartyLegalEntity", el("cbc:RegistrationName", b.name), b.orgNr && b.address.country === "SE" && el("cbc:CompanyID", b.orgNr.replace(/\D/g, ""), { schemeID: "0007" })),
  ));

  const payment = !credit && (s.bankgiro || s.iban) ? wrap("cac:PaymentMeans",
    el("cbc:PaymentMeansCode", s.bankgiro ? "30" : "58"),
    x.ocr && el("cbc:PaymentID", x.ocr),
    wrap("cac:PayeeFinancialAccount",
      el("cbc:ID", s.bankgiro ? s.bankgiro.replace(/\D/g, "") : s.iban!),
      s.bankgiro ? wrap("cac:FinancialInstitutionBranch", el("cbc:ID", "SE:BANKGIRO")) : s.bic && wrap("cac:FinancialInstitutionBranch", el("cbc:ID", s.bic))),
  ) : "";
  const terms = !credit ? wrap("cac:PaymentTerms", el("cbc:Note", `${x.termsDays} ${x.language === "sv" ? "dagar netto" : "days net"}. ${x.lateInterestText ?? ""}`.trim())) : "";

  const taxTotal = wrap("cac:TaxTotal", money("cbc:TaxAmount", x.totalVat, cur),
    ...x.vat.map((r) => wrap("cac:TaxSubtotal", money("cbc:TaxableAmount", r.base, cur), money("cbc:TaxAmount", r.vat, cur), taxCategory("cac:TaxCategory", r.category, r.rateBp, x.legalNotes[0]))));
  // PEPPOL-EN16931-R053: with a tax currency, a second TaxTotal in SEK without subtotals.
  const taxTotalSek = cur !== "SEK" && x.totalVatSek !== undefined ? wrap("cac:TaxTotal", money("cbc:TaxAmount", x.totalVatSek, "SEK")) : "";

  const lines = x.lines.map((l, i) => {
    const gross = (l.quantity * l.unitPrice) / 1000n;
    const allowance = gross - l.net;
    return wrap(credit ? "cac:CreditNoteLine" : "cac:InvoiceLine",
      el("cbc:ID", String(i + 1)),
      el(credit ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity", qty(l.quantity), { unitCode: unitCode(l.unit) }),
      money("cbc:LineExtensionAmount", l.net, cur),
      allowance !== 0n && wrap("cac:AllowanceCharge", el("cbc:ChargeIndicator", "false"), el("cbc:AllowanceChargeReason", x.language === "sv" ? "Rabatt" : "Discount"), money("cbc:Amount", allowance, cur)),
      wrap("cac:Item", el("cbc:Name", l.description.slice(0, 200)), taxCategory("cac:ClassifiedTaxCategory", x.vat.find((r) => r.vatCode === l.vatCode)?.category ?? "S", l.rateBp)),
      wrap("cac:Price", money("cbc:PriceAmount", l.unitPrice, cur)),
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="${ns}" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">` + [
    el("cbc:CustomizationID", CUSTOMIZATION_ID),
    el("cbc:ProfileID", PROFILE_ID),
    el("cbc:ID", String(x.number)),
    el("cbc:IssueDate", x.issueDate),
    !credit && x.dueDate && el("cbc:DueDate", x.dueDate),
    el(credit ? "cbc:CreditNoteTypeCode" : "cbc:InvoiceTypeCode", credit ? "381" : "380"),
    x.notes && el("cbc:Note", x.notes),
    el("cbc:DocumentCurrencyCode", cur),
    cur !== "SEK" && el("cbc:TaxCurrencyCode", "SEK"),
    el("cbc:BuyerReference", x.yourRef ?? b.name),
    x.creditOf && wrap("cac:BillingReference", wrap("cac:InvoiceDocumentReference", el("cbc:ID", String(x.creditOf.number)), el("cbc:IssueDate", x.creditOf.issueDate))),
    supplier,
    customer,
    x.deliveryDate && wrap("cac:Delivery", el("cbc:ActualDeliveryDate", x.deliveryDate)),
    payment,
    terms,
    taxTotal,
    taxTotalSek,
    wrap("cac:LegalMonetaryTotal",
      money("cbc:LineExtensionAmount", x.totalNet, cur), money("cbc:TaxExclusiveAmount", x.totalNet, cur),
      money("cbc:TaxInclusiveAmount", x.total, cur), money("cbc:PayableAmount", x.total, cur)),
    ...lines,
  ].filter(Boolean).join("") + `</${root}>\n`;
}

// Year-end outputs computed in the browser (spec principle 1): INK2R from balances via the
// BAS → SRU table, the K2 income statement and balance sheet, INK2S/INK2 from the tax
// calculation, and the SRU files for Skatteverket's Filöverföring.
// Sources (docs/accounting/sources.md): V15 (BAS "INK2_P1_intervall-241119"), V16 (SRU
// format, field codes 2026P4, sign convention), V19 (K2 layout BFNAR 2016:10 4.3–4.8).
import type { TaxCalc } from "../../bindings/accounting";

type Range = readonly [number, number];
/** "*": balance item; "+": income on the form; "-": cost on the form (given positive). */
export type Sign = "*" | "+" | "-";

/** One INK2R field and the BAS accounts it collects (V15). */
const FIELDS: readonly { code: number; sign: Sign; ranges: readonly Range[] }[] = [
  { code: 7201, sign: "*", ranges: [[1000, 1087], [1089, 1099]] },
  { code: 7202, sign: "*", ranges: [[1088, 1088]] },
  { code: 7214, sign: "*", ranges: [[1100, 1119], [1130, 1179], [1190, 1199]] },
  { code: 7215, sign: "*", ranges: [[1200, 1279], [1290, 1299]] },
  { code: 7216, sign: "*", ranges: [[1120, 1129]] },
  { code: 7217, sign: "*", ranges: [[1180, 1189], [1280, 1289]] },
  { code: 7230, sign: "*", ranges: [[1310, 1319]] },
  { code: 7231, sign: "*", ranges: [[1330, 1335], [1338, 1339]] },
  { code: 7233, sign: "*", ranges: [[1350, 1359], [1336, 1337]] },
  { code: 7232, sign: "*", ranges: [[1320, 1329], [1340, 1345], [1348, 1349]] },
  { code: 7234, sign: "*", ranges: [[1360, 1369]] },
  { code: 7235, sign: "*", ranges: [[1370, 1389], [1346, 1347]] },
  { code: 7241, sign: "*", ranges: [[1410, 1429]] },
  { code: 7242, sign: "*", ranges: [[1440, 1449]] },
  { code: 7243, sign: "*", ranges: [[1450, 1469]] },
  { code: 7244, sign: "*", ranges: [[1490, 1499]] },
  { code: 7245, sign: "*", ranges: [[1470, 1479]] },
  { code: 7246, sign: "*", ranges: [[1480, 1489]] },
  { code: 7251, sign: "*", ranges: [[1510, 1559], [1580, 1589]] },
  { code: 7252, sign: "*", ranges: [[1560, 1572], [1574, 1579], [1660, 1669], [1671, 1672], [1674, 1679]] },
  { code: 7261, sign: "*", ranges: [[1610, 1619], [1630, 1659], [1680, 1699], [1573, 1573], [1673, 1673]] },
  { code: 7262, sign: "*", ranges: [[1620, 1629]] },
  { code: 7263, sign: "*", ranges: [[1700, 1799]] },
  { code: 7270, sign: "*", ranges: [[1860, 1869]] },
  { code: 7271, sign: "*", ranges: [[1800, 1859], [1870, 1899]] },
  { code: 7281, sign: "*", ranges: [[1900, 1999]] },
  { code: 7301, sign: "*", ranges: [[2080, 2089]] },
  { code: 7302, sign: "*", ranges: [[2090, 2099]] },
  { code: 7321, sign: "*", ranges: [[2110, 2139]] },
  { code: 7322, sign: "*", ranges: [[2150, 2159]] },
  { code: 7323, sign: "*", ranges: [[2160, 2199]] },
  { code: 7331, sign: "*", ranges: [[2210, 2219]] },
  { code: 7332, sign: "*", ranges: [[2230, 2239]] },
  { code: 7333, sign: "*", ranges: [[2220, 2229], [2240, 2299]] },
  { code: 7350, sign: "*", ranges: [[2310, 2329]] },
  { code: 7351, sign: "*", ranges: [[2330, 2339]] },
  { code: 7352, sign: "*", ranges: [[2340, 2359]] },
  { code: 7353, sign: "*", ranges: [[2360, 2372], [2374, 2379]] },
  { code: 7354, sign: "*", ranges: [[2380, 2399], [2373, 2373]] },
  { code: 7360, sign: "*", ranges: [[2480, 2489]] },
  { code: 7361, sign: "*", ranges: [[2410, 2419]] },
  { code: 7362, sign: "*", ranges: [[2420, 2429]] },
  { code: 7363, sign: "*", ranges: [[2430, 2439]] },
  { code: 7364, sign: "*", ranges: [[2450, 2459]] },
  { code: 7365, sign: "*", ranges: [[2440, 2449]] },
  { code: 7366, sign: "*", ranges: [[2492, 2492]] },
  { code: 7367, sign: "*", ranges: [[2460, 2472], [2474, 2479], [2874, 2879]] },
  { code: 7369, sign: "*", ranges: [[2490, 2491], [2493, 2499], [2600, 2859], [2880, 2899]] },
  { code: 7368, sign: "*", ranges: [[2500, 2599]] },
  { code: 7370, sign: "*", ranges: [[2900, 2999]] },
  { code: 7410, sign: "+", ranges: [[3000, 3799]] },
  { code: 7412, sign: "+", ranges: [[3800, 3899]] },
  { code: 7413, sign: "+", ranges: [[3900, 3999]] },
  // 40xx–47xx is given to both 7511 and 7512 in the BAS table; K2 puts material used in
  // service work under Råvaror och förnödenheter, so 7511 is the default (sruCode overrides).
  { code: 7511, sign: "-", ranges: [[4000, 4799], [4910, 4920]] },
  { code: 7512, sign: "-", ranges: [[4960, 4969], [4980, 4989]] },
  { code: 7513, sign: "-", ranges: [[5000, 6999]] },
  { code: 7514, sign: "-", ranges: [[7000, 7699]] },
  { code: 7515, sign: "-", ranges: [[7700, 7739], [7750, 7789], [7800, 7899]] },
  { code: 7516, sign: "-", ranges: [[7740, 7749], [7790, 7799]] },
  { code: 7517, sign: "-", ranges: [[7900, 7999]] },
  { code: 7417, sign: "+", ranges: [[8300, 8369], [8390, 8399]] },
  { code: 7521, sign: "-", ranges: [[8070, 8089], [8170, 8189], [8270, 8289], [8370, 8389]] },
  { code: 7522, sign: "-", ranges: [[8400, 8499]] },
  { code: 7524, sign: "-", ranges: [[8830, 8839]] },
  { code: 7419, sign: "+", ranges: [[8820, 8829]] },
  { code: 7420, sign: "+", ranges: [[8819, 8819]] },
  { code: 7525, sign: "-", ranges: [[8811, 8811]] },
  { code: 7527, sign: "-", ranges: [[8840, 8849]] },
  { code: 7528, sign: "-", ranges: [[8900, 8989]] },
];

/** Groups reported on a + field when the net is income and on a − field otherwise. */
const PAIRS: readonly { plus: number; minus: number; ranges: readonly Range[] }[] = [
  { plus: 7411, minus: 7510, ranges: [[4900, 4909], [4930, 4959], [4970, 4979], [4990, 4999]] },
  { plus: 7414, minus: 7518, ranges: [[8000, 8069], [8090, 8099]] },
  { plus: 7415, minus: 7519, ranges: [[8100, 8112], [8114, 8117], [8119, 8122], [8124, 8132], [8134, 8169], [8190, 8199]] },
  { plus: 7423, minus: 7530, ranges: [[8113, 8113], [8118, 8118], [8123, 8123], [8133, 8133]] },
  { plus: 7416, minus: 7520, ranges: [[8200, 8269], [8290, 8299]] },
  { plus: 7420, minus: 7525, ranges: [[8810, 8810]] },
  { plus: 7421, minus: 7526, ranges: [[8850, 8859]] },
  { plus: 7422, minus: 7527, ranges: [[8860, 8899]] },
];

const SIGN = new Map<number, Sign>([...FIELDS.map((f) => [f.code, f.sign] as const), ...PAIRS.flatMap((p) => [[p.plus, "+"], [p.minus, "-"]] as const)]);
const inRanges = (n: number, rs: readonly Range[]) => rs.some(([a, b]) => a <= n && n <= b);

export type Target = { code: number } | { pair: number };

/** Where an account is reported; an own SRU code on the account wins. Null: not reported (899x). */
export function targetOf(account: number, sruCode?: string | null): Target | null {
  const own = sruCode ? Number(sruCode) : NaN;
  if (Number.isInteger(own) && SIGN.has(own)) return { code: own };
  if (account >= 8990) return null;
  const f = FIELDS.find((x) => inRanges(account, x.ranges));
  if (f) return { code: f.code };
  const p = PAIRS.findIndex((x) => inRanges(account, x.ranges));
  return p >= 0 ? { pair: p } : null;
}

/** Öre to whole kronor, half away from zero. */
export const kr = (ore: bigint): bigint => (ore >= 0n ? (ore + 50n) / 100n : -((-ore + 50n) / 100n));

export type Accounts = ReadonlyMap<number, { sruCode?: string | null }>;

/**
 * INK2R in whole kronor from balances in öre (debit positive): balance-sheet accounts at
 * their closing balance, result accounts at the year's movement. Zero fields are left out.
 * 3.26/3.27 is the sum of the rounded result fields, so the form adds up.
 */
export function ink2r(balances: ReadonlyMap<number, bigint>, accounts: Accounts = new Map()): Map<number, bigint> {
  const ore = new Map<number, bigint>();
  const pairs = PAIRS.map(() => 0n);
  for (const [acc, amount] of balances) {
    const t = targetOf(acc, accounts.get(acc)?.sruCode);
    if (!t) continue;
    if ("pair" in t) { pairs[t.pair] += amount; continue; }
    ore.set(t.code, (ore.get(t.code) ?? 0n) + amount);
  }
  const out = new Map<number, bigint>();
  for (const [code, amount] of ore) {
    const sign = SIGN.get(code)!;
    // Assets as debit balances; equity, liabilities and income as credit balances; costs as debits.
    const v = sign === "*" ? (code < 7300 ? amount : -amount) : sign === "+" ? -amount : amount;
    out.set(code, (out.get(code) ?? 0n) + kr(v));
  }
  PAIRS.forEach((p, i) => {
    const net = kr(-pairs[i]);
    if (net > 0n) out.set(p.plus, (out.get(p.plus) ?? 0n) + net);
    if (net < 0n) out.set(p.minus, (out.get(p.minus) ?? 0n) - net);
  });
  let result = 0n;
  for (const [code, v] of out) { const s = SIGN.get(code); if (code >= 7400 && s === "+") result += v; if (code >= 7400 && s === "-") result -= v; }
  if (result > 0n) out.set(7450, result);
  if (result < 0n) out.set(7550, -result);
  for (const [k, v] of out) if (v === 0n) out.delete(k);
  return out;
}

export const yearResult = (f: ReadonlyMap<number, bigint>) => (f.get(7450) ?? 0n) - (f.get(7550) ?? 0n);

// ── K2 statements (V19) ──

export type StatementRow = { label: string; kind: "heading" | "item" | "sum" | "total"; cur: bigint; prev: bigint };
type Def = { label: string; kind: StatementRow["kind"]; value: (f: ReadonlyMap<number, bigint>) => bigint };

const g = (f: ReadonlyMap<number, bigint>, ...codes: number[]) => codes.reduce((s, c) => s + (f.get(c) ?? 0n), 0n);
const net = (plus: number, minus: number) => (f: ReadonlyMap<number, bigint>) => g(f, plus) - g(f, minus);
const cost = (code: number) => (f: ReadonlyMap<number, bigint>) => -g(f, code);
const item = (label: string, value: Def["value"]): Def => ({ label, kind: "item", value });

const OPERATING_INCOME = (f: ReadonlyMap<number, bigint>) => g(f, 7410, 7411, 7412, 7413) - g(f, 7510);
const OPERATING_COSTS = (f: ReadonlyMap<number, bigint>) => -g(f, 7511, 7512, 7513, 7514, 7515, 7516, 7517);
const FINANCIAL = (f: ReadonlyMap<number, bigint>) => g(f, 7414, 7415, 7423, 7416, 7417) - g(f, 7518, 7519, 7530, 7520, 7521, 7522);
const APPROPRIATIONS = (f: ReadonlyMap<number, bigint>) => g(f, 7419, 7420, 7421, 7422) - g(f, 7524, 7525, 7526, 7527);

const INCOME: Def[] = [
  { label: "Rörelseintäkter, lagerförändringar m.m.", kind: "heading", value: () => 0n },
  item("Nettoomsättning", (f) => g(f, 7410)),
  item("Förändring av lager av produkter i arbete, färdiga varor och pågående arbete för annans räkning", net(7411, 7510)),
  item("Aktiverat arbete för egen räkning", (f) => g(f, 7412)),
  item("Övriga rörelseintäkter", (f) => g(f, 7413)),
  { label: "Summa rörelseintäkter, lagerförändringar m.m.", kind: "sum", value: OPERATING_INCOME },
  { label: "Rörelsekostnader", kind: "heading", value: () => 0n },
  item("Råvaror och förnödenheter", cost(7511)),
  item("Handelsvaror", cost(7512)),
  item("Övriga externa kostnader", cost(7513)),
  item("Personalkostnader", cost(7514)),
  item("Av- och nedskrivningar av materiella och immateriella anläggningstillgångar", cost(7515)),
  item("Nedskrivningar av omsättningstillgångar utöver normala nedskrivningar", cost(7516)),
  item("Övriga rörelsekostnader", cost(7517)),
  { label: "Summa rörelsekostnader", kind: "sum", value: OPERATING_COSTS },
  { label: "Rörelseresultat", kind: "total", value: (f) => OPERATING_INCOME(f) + OPERATING_COSTS(f) },
  { label: "Finansiella poster", kind: "heading", value: () => 0n },
  item("Resultat från andelar i koncernföretag", net(7414, 7518)),
  item("Resultat från andelar i intresseföretag och gemensamt styrda företag", net(7415, 7519)),
  item("Resultat från övriga företag som det finns ett ägarintresse i", net(7423, 7530)),
  item("Resultat från övriga finansiella anläggningstillgångar", net(7416, 7520)),
  item("Övriga ränteintäkter och liknande resultatposter", (f) => g(f, 7417)),
  item("Nedskrivningar av finansiella anläggningstillgångar och kortfristiga placeringar", cost(7521)),
  item("Räntekostnader och liknande resultatposter", cost(7522)),
  { label: "Summa finansiella poster", kind: "sum", value: FINANCIAL },
  { label: "Resultat efter finansiella poster", kind: "total", value: (f) => OPERATING_INCOME(f) + OPERATING_COSTS(f) + FINANCIAL(f) },
  { label: "Bokslutsdispositioner", kind: "heading", value: () => 0n },
  item("Erhållna koncernbidrag", (f) => g(f, 7419)),
  item("Lämnade koncernbidrag", cost(7524)),
  item("Förändring av periodiseringsfonder", net(7420, 7525)),
  item("Förändring av överavskrivningar", net(7421, 7526)),
  item("Övriga bokslutsdispositioner", net(7422, 7527)),
  { label: "Summa bokslutsdispositioner", kind: "sum", value: APPROPRIATIONS },
  { label: "Resultat före skatt", kind: "total", value: (f) => OPERATING_INCOME(f) + OPERATING_COSTS(f) + FINANCIAL(f) + APPROPRIATIONS(f) },
  { label: "Skatter", kind: "heading", value: () => 0n },
  item("Skatt på årets resultat", cost(7528)),
  { label: "Årets resultat", kind: "total", value: yearResult },
];

const sumOf = (...codes: number[]) => (f: ReadonlyMap<number, bigint>) => g(f, ...codes);
const INTANGIBLE = [7201, 7202], TANGIBLE = [7214, 7215, 7216, 7217], FINANCIAL_FIXED = [7230, 7231, 7233, 7232, 7234, 7235];
const STOCK = [7241, 7242, 7243, 7244, 7245, 7246], RECEIVABLES = [7251, 7252, 7261, 7262, 7263], INVEST = [7270, 7271], CASH = [7281];
const UNTAXED = [7321, 7322, 7323], PROVISIONS = [7331, 7332, 7333], LONG = [7350, 7351, 7352, 7353, 7354];
const SHORT = [7360, 7361, 7362, 7363, 7364, 7365, 7366, 7367, 7369, 7368, 7370];
/**
 * Balanced profit or loss: free equity without this year's result. Once the result is closed
 * to 2099 it is taken out at the statement's figure, so rounding stays here and the sheet balances.
 */
const retained = (f: ReadonlyMap<number, bigint>) => g(f, 7302) - ((f.get(-2099) ?? 0n) !== 0n ? yearResult(f) : 0n);
const equity = (f: ReadonlyMap<number, bigint>) => g(f, 7301) + retained(f) + yearResult(f);
const labelled = (codes: number[], labels: Record<number, string>) => codes.map((c) => item(labels[c], sumOf(c)));

const BS_LABELS: Record<number, string> = {
  7201: "Koncessioner, patent, licenser, varumärken samt liknande rättigheter", 7202: "Förskott avseende immateriella anläggningstillgångar",
  7214: "Byggnader och mark", 7215: "Maskiner, inventarier och övriga materiella anläggningstillgångar", 7216: "Förbättringsutgifter på annans fastighet",
  7217: "Pågående nyanläggningar och förskott avseende materiella anläggningstillgångar", 7230: "Andelar i koncernföretag",
  7231: "Andelar i intresseföretag och gemensamt styrda företag", 7233: "Ägarintressen i övriga företag och andra långfristiga värdepappersinnehav",
  7232: "Fordringar hos koncern-, intresse- och gemensamt styrda företag", 7234: "Lån till delägare eller närstående",
  7235: "Andra långfristiga fordringar", 7241: "Råvaror och förnödenheter", 7242: "Varor under tillverkning", 7243: "Färdiga varor och handelsvaror",
  7244: "Övriga lagertillgångar", 7245: "Pågående arbete för annans räkning", 7246: "Förskott till leverantörer", 7251: "Kundfordringar",
  7252: "Fordringar hos koncern-, intresse- och gemensamt styrda företag", 7261: "Övriga fordringar", 7262: "Upparbetad men ej fakturerad intäkt",
  7263: "Förutbetalda kostnader och upplupna intäkter", 7270: "Andelar i koncernföretag", 7271: "Övriga kortfristiga placeringar",
  7281: "Kassa och bank", 7321: "Periodiseringsfonder", 7322: "Ackumulerade överavskrivningar", 7323: "Övriga obeskattade reserver",
  7331: "Avsättningar för pensioner och liknande förpliktelser enligt lagen (1967:531) om tryggande av pensionsutfästelse m.m.",
  7332: "Övriga avsättningar för pensioner och liknande förpliktelser", 7333: "Övriga avsättningar", 7350: "Obligationslån", 7351: "Checkräkningskredit",
  7352: "Övriga skulder till kreditinstitut", 7353: "Skulder till koncern-, intresse- och gemensamt styrda företag", 7354: "Övriga skulder",
  7360: "Checkräkningskredit", 7361: "Övriga skulder till kreditinstitut", 7362: "Förskott från kunder", 7363: "Pågående arbete för annans räkning",
  7364: "Fakturerad men ej upparbetad intäkt", 7365: "Leverantörsskulder", 7366: "Växelskulder", 7367: "Skulder till koncern-, intresse- och gemensamt styrda företag",
  7369: "Övriga skulder", 7368: "Skatteskulder", 7370: "Upplupna kostnader och förutbetalda intäkter",
};
const group = (heading: string, codes: number[], sumLabel: string): Def[] => [
  { label: heading, kind: "heading", value: () => 0n }, ...labelled(codes, BS_LABELS), { label: sumLabel, kind: "sum", value: sumOf(...codes) },
];
const ASSETS = [...INTANGIBLE, ...TANGIBLE, ...FINANCIAL_FIXED, ...STOCK, ...RECEIVABLES, ...INVEST, ...CASH];

const BALANCE: Def[] = [
  { label: "Tillgångar", kind: "heading", value: () => 0n },
  ...group("Immateriella anläggningstillgångar", INTANGIBLE, "Summa immateriella anläggningstillgångar"),
  ...group("Materiella anläggningstillgångar", TANGIBLE, "Summa materiella anläggningstillgångar"),
  ...group("Finansiella anläggningstillgångar", FINANCIAL_FIXED, "Summa finansiella anläggningstillgångar"),
  { label: "Summa anläggningstillgångar", kind: "sum", value: sumOf(...INTANGIBLE, ...TANGIBLE, ...FINANCIAL_FIXED) },
  ...group("Varulager m.m.", STOCK, "Summa varulager"),
  ...group("Kortfristiga fordringar", RECEIVABLES, "Summa kortfristiga fordringar"),
  ...group("Kortfristiga placeringar", INVEST, "Summa kortfristiga placeringar"),
  ...group("Kassa och bank", CASH, "Summa kassa och bank"),
  { label: "Summa omsättningstillgångar", kind: "sum", value: sumOf(...STOCK, ...RECEIVABLES, ...INVEST, ...CASH) },
  { label: "Summa tillgångar", kind: "total", value: sumOf(...ASSETS) },
  { label: "Eget kapital och skulder", kind: "heading", value: () => 0n },
  { label: "Eget kapital", kind: "heading", value: () => 0n },
  item("Bundet eget kapital", sumOf(7301)),
  item("Balanserat resultat", retained),
  item("Årets resultat", yearResult),
  { label: "Summa eget kapital", kind: "sum", value: equity },
  ...group("Obeskattade reserver", UNTAXED, "Summa obeskattade reserver"),
  ...group("Avsättningar", PROVISIONS, "Summa avsättningar"),
  ...group("Långfristiga skulder", LONG, "Summa långfristiga skulder"),
  ...group("Kortfristiga skulder", SHORT, "Summa kortfristiga skulder"),
  { label: "Summa eget kapital och skulder", kind: "total", value: (f) => equity(f) + g(f, ...UNTAXED, ...PROVISIONS, ...LONG, ...SHORT) },
];

/**
 * The fields for the statements: INK2R plus the amount on 2099 under the key −2099, so the
 * balance sheet shows this year's result once, whether or not it was closed to 2099.
 */
export function statementFields(balances: ReadonlyMap<number, bigint>, accounts: Accounts = new Map()): Map<number, bigint> {
  const f = ink2r(balances, accounts);
  f.set(-2099, kr(-(balances.get(2099) ?? 0n)));
  return f;
}

/** K2 rows; items and headings with nothing in either year are left out (ÅRL 3:4). */
function rows(defs: Def[], cur: ReadonlyMap<number, bigint>, prev: ReadonlyMap<number, bigint>): StatementRow[] {
  const all = defs.map((d) => ({ label: d.label, kind: d.kind, cur: d.value(cur), prev: d.value(prev) }));
  return all.filter((r, i) => {
    if (r.kind === "item") return r.cur !== 0n || r.prev !== 0n;
    if (r.kind !== "heading") return true;
    // A heading stays when an item below it (up to the next heading or sum) has an amount.
    for (let j = i + 1; j < all.length && all[j].kind === "item"; j++) if (all[j].cur !== 0n || all[j].prev !== 0n) return true;
    return all[i + 1]?.kind === "heading";
  }).filter((r, i, arr) => r.kind !== "sum" || arr[i - 1]?.kind === "item" || r.cur !== 0n || r.prev !== 0n);
}

export const incomeStatement = (cur: ReadonlyMap<number, bigint>, prev: ReadonlyMap<number, bigint>) => rows(INCOME, cur, prev);
export const balanceSheet = (cur: ReadonlyMap<number, bigint>, prev: ReadonlyMap<number, bigint>) => rows(BALANCE, cur, prev);

// ── INK2S and INK2 ──

/** INK2S from the tax calculation, in kronor; 4.15/4.16 add up from the rounded fields. */
export function ink2s(r: ReadonlyMap<number, bigint>, calc: Pick<TaxCalc, "nonDeductible" | "taxFree" | "schablon" | "deficitIn" | "otherAdd" | "otherDeduct">): Map<number, bigint> {
  const f = new Map<number, bigint>([
    [7650, r.get(7450) ?? 0n], [7750, r.get(7550) ?? 0n], [7651, r.get(7528) ?? 0n],
    [7653, kr(calc.nonDeductible)], [7654, kr(calc.schablon)], [7754, kr(calc.taxFree)],
    [7663, kr(calc.otherAdd)], [7762, kr(calc.otherDeduct)], [7763, kr(calc.deficitIn)],
  ]);
  const total = f.get(7650)! - f.get(7750)! + f.get(7651)! + f.get(7653)! + f.get(7654)! - f.get(7754)! + f.get(7663)! - f.get(7762)! - f.get(7763)!;
  if (total > 0n) f.set(7670, total);
  if (total < 0n) f.set(7770, -total);
  for (const [k, v] of f) if (v === 0n) f.delete(k);
  return f;
}

export const ink2 = (s: ReadonlyMap<number, bigint>) => new Map<number, bigint>([[7104, s.get(7670) ?? 0n], [7114, s.get(7770) ?? 0n]].filter(([, v]) => v !== 0n) as [number, bigint][]);

// ── SRU files (V16) ──

/** Beskattningsperiod from the last day of the year: P1 Jan–Apr, P2 May–Jun, P3 Jul–Aug, P4 Sep–Dec. */
export function taxPeriod(end: string): string {
  const m = Number(end.slice(5, 7));
  return `${end.slice(0, 4)}P${m <= 4 ? 1 : m <= 6 ? 2 : m <= 8 ? 3 : 4}`;
}

/** 556000-0100 → 165560000100 (century "16" for legal persons). */
export const sruOrgNr = (orgNr: string) => `16${orgNr.replace(/\D/g, "")}`;

/** Text values: no "#", one line, ISO 8859-1 only. */
const clean = (s: string) => s.replace(/[#\r\n\t]/g, " ").replace(/[^ -ÿ]/g, "?").trim();

function latin1(text: string): Uint8Array {
  const b = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) b[i] = text.charCodeAt(i) <= 0xff ? text.charCodeAt(i) : 0x3f;
  return b;
}

export type SruInput = {
  orgNr: string; name: string; street?: string; postalCode: string; city: string; email?: string; phone?: string;
  start: string; end: string; created: Date; forms: { form: "INK2" | "INK2R" | "INK2S"; fields: ReadonlyMap<number, bigint> }[];
};

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return [`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`, `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`] as const;
};

/** INFO.SRU and BLANKETTER.SRU, records in the order the format requires, LF line ends. */
export function sruFiles(x: SruInput): { info: Uint8Array; blanketter: Uint8Array; infoText: string; blanketterText: string } {
  const [date, time] = stamp(x.created);
  const org = sruOrgNr(x.orgNr);
  const info = [
    "#DATABESKRIVNING_START", "#PRODUKT SRU", `#SKAPAD ${date} ${time}`, "#PROGRAM AXELKOD", "#FILNAMN BLANKETTER.SRU", "#DATABESKRIVNING_SLUT",
    "#MEDIELEV_START", `#ORGNR ${org}`, `#NAMN ${clean(x.name)}`,
    ...(x.street ? [`#ADRESS ${clean(x.street)}`] : []),
    `#POSTNR ${x.postalCode.replace(/\D/g, "")}`, `#POSTORT ${clean(x.city)}`,
    ...(x.email ? [`#EMAIL ${clean(x.email)}`] : []),
    ...(x.phone ? [`#TELEFON ${clean(x.phone).slice(0, 15)}`] : []),
    "#MEDIELEV_SLUT",
  ];
  const period = taxPeriod(x.end);
  const blocks = x.forms.flatMap(({ form, fields }) => [
    `#BLANKETT ${form}-${period}`, `#IDENTITET ${org} ${date} ${time}`, `#NAMN ${clean(x.name)}`,
    `#UPPGIFT 7011 ${x.start.replace(/-/g, "")}`, `#UPPGIFT 7012 ${x.end.replace(/-/g, "")}`,
    ...[...fields].filter(([, v]) => v !== 0n).sort(([a], [b]) => a - b).map(([code, v]) => `#UPPGIFT ${code} ${v}`),
    "#BLANKETTSLUT",
  ]);
  const infoText = `${info.join("\n")}\n`;
  const blanketterText = `${[...blocks, "#FIL_SLUT"].join("\n")}\n`;
  return { info: latin1(infoText), blanketter: latin1(blanketterText), infoText, blanketterText };
}

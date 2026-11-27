// Prova CRA card background: an illustrative evidence lifecycle. Supplier → Prova
// ledger → buyer, with packets for the signed statement, the receipt and the key
// delivery, a live ledger log and running counters, plus a faint field of digests
// across the whole card. Purely decorative and labelled "simulated".
import { iconSvg } from "../home-icons";
import type { Lang } from "../home-render";
import type { SimMount } from "./index";

type Kind = "received" | "validated" | "registered" | "rejected" | "superseded" | "granted" | "accepted";
const SEQUENCE: Kind[] = ["received", "validated", "registered", "granted", "received", "rejected", "received", "validated", "registered", "superseded", "accepted"];
const RELEASES = ["plc-firmware 4.2.1", "hmi-panel 2.0.3", "gateway-os 1.8.0", "drive-ctl 3.1.4", "edge-agent 0.9.7"];
const SUPPLIERS = ["supplier-a", "supplier-b"];

const T: Record<Lang, Record<Kind | "supplier" | "ledger" | "buyer" | "signed" | "receipt" | "keys" | "statements" | "receipts" | "rejectedCount" | "simulated", string>> = {
  sv: {
    received: "mottagen", validated: "validerad", registered: "registrerad", rejected: "avvisad", superseded: "ersatt", granted: "åtkomst", accepted: "godkänd",
    supplier: "Leverantör", ledger: "Prova-register", buyer: "Köpare", signed: "signerat intyg", receipt: "kvitto", keys: "nycklar",
    statements: "Intyg", receipts: "Kvitton", rejectedCount: "Avvisade", simulated: "Simulerat"
  },
  en: {
    received: "received", validated: "validated", registered: "registered", rejected: "rejected", superseded: "superseded", granted: "granted", accepted: "accepted",
    supplier: "Supplier", ledger: "Prova ledger", buyer: "Buyer", signed: "signed statement", receipt: "receipt", keys: "keys",
    statements: "Statements", receipts: "Receipts", rejectedCount: "Rejected", simulated: "Simulated"
  },
};

const HEX = "0123456789abcdef";
const digest = (n = 8) => Array.from({ length: n }, () => HEX[(Math.random() * 16) | 0]).join("");

/** Icon inside the flow diagram, as a nested svg centred on (x, y). */
const icon = (key: string, x: number, y: number) =>
  iconSvg(key, "sim-node-icon").replace('width="24" height="24"', `x="${x - 13}" y="${y - 13}" width="26" height="26"`);

function flowSvg(t: (typeof T)[Lang], animate: boolean): string {
  const node = (x: number, label: string, sub: string, ico: string, tone: string) =>
    `<g class="sim-node sim-node--${tone}"><rect x="${x - 28}" y="30" width="56" height="56" rx="16"/>${icon(ico, x, 58)}<text x="${x}" y="112" class="sim-label">${label}</text><text x="${x}" y="130" class="sim-sub">${sub}</text></g>`;
  const packet = (path: string, tone: string, begin: string) =>
    animate ? `<circle r="4.5" class="sim-packet sim-packet--${tone}"><animateMotion dur="3.2s" begin="${begin}" repeatCount="indefinite"><mpath href="#${path}"/></animateMotion></circle>` : "";
  const id = `prova-${digest(4)}`; // unique per mount: the card can be rendered twice (sv/en, admin preview)
  return `<svg viewBox="0 0 560 150" class="sim-flow" aria-hidden="true">
<path id="${id}-a" d="M 105 48 C 160 18, 220 18, 250 48" class="sim-path"/>
<path id="${id}-b" d="M 310 48 C 340 18, 400 18, 455 48" class="sim-path"/>
<path id="${id}-c" d="M 310 68 C 340 98, 400 98, 455 68" class="sim-path"/>
${packet(`${id}-a`, "a", "0s")}${packet(`${id}-b`, "b", "1.6s")}${packet(`${id}-c`, "c", "2.4s")}
${node(70, t.supplier, t.signed, "factory", "a")}${node(280, t.ledger, t.receipt, "shield", "b")}${node(490, t.buyer, t.keys, "key", "c")}
</svg>`;
}

export const mount: SimMount = (el, lang) => {
  const t = T[lang];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wrap = document.createElement("div");
  wrap.className = "sim-prova";
  const field = Array.from({ length: 18 }, () => Array.from({ length: 6 }, () => `sha256:${digest(12)}`).join("  ")).join("\n");
  wrap.innerHTML = `<pre class="sim-field">${field}</pre>
<div class="sim-panel"><span class="sim-tag">${t.simulated}</span>${flowSvg(t, !reduced)}
<div class="sim-log"></div>
<div class="sim-stats"><div><span class="sim-tone--a">${t.statements}</span><b data-n="statements">0</b></div><div><span class="sim-tone--b">${t.receipts}</span><b data-n="receipts">0</b></div><div><span class="sim-tone--err">${t.rejectedCount}</span><b data-n="rejected">0</b></div></div>
</div>`;
  el.append(wrap);
  const log = wrap.querySelector<HTMLElement>(".sim-log")!;
  const counts = { statements: 0, receipts: 0, rejected: 0 };
  let step = 0;
  let receipt = 1040;

  const line = () => {
    const kind = SEQUENCE[step % SEQUENCE.length];
    if (kind === "registered") receipt++;
    const row = document.createElement("div");
    row.className = "sim-row";
    row.innerHTML = `<span class="sim-time">${new Date().toTimeString().slice(0, 8)}</span><span class="sim-kind sim-kind--${kind}">${t[kind]}</span><span class="sim-who">${SUPPLIERS[(step >> 1) % SUPPLIERS.length]}</span><span class="sim-rel">${RELEASES[(step * 7) % RELEASES.length]}</span><span class="sim-dig">sha256:${digest()}…</span>`;
    step++;
    log.append(row);
    while (log.children.length > 7) log.firstElementChild?.remove();
    if (kind === "received") counts.statements++;
    if (kind === "registered") counts.receipts++;
    if (kind === "rejected") counts.rejected++;
    for (const [k, v] of Object.entries(counts)) wrap.querySelector(`[data-n="${k}"]`)!.textContent = String(v);
  };

  for (let i = 0; i < 6; i++) line();
  if (reduced) return () => wrap.remove();

  let visible = false;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(el);
  const timer = setInterval(() => visible && !document.hidden && line(), 1300);
  return () => {
    clearInterval(timer);
    io.disconnect();
    wrap.remove();
  };
};

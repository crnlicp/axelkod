// Generates favicons, app icons and the OG image from docs/brand/axelkod-logo.svg.
// Run manually when the logo changes: `npm run brand-assets`. Output goes to public/
// and is committed, so normal builds don't need a browser.
import { chromium } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const logo = readFileSync(resolve(root, "../../docs/brand/axelkod-logo.svg"), "utf8");

const NAVY = "#032843";
const TEAL = "#05A390";
const inner = logo.slice(logo.indexOf(">") + 1, logo.lastIndexOf("</svg>"));
// The wordmark is the last path; everything before it is the symbol.
const symbolInner = inner.slice(0, inner.lastIndexOf("<path"));
const SYMBOL_VIEWBOX = "230 70 525 612";
const symbolSvg = (navy = NAVY, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SYMBOL_VIEWBOX}"${extra}>${symbolInner.replaceAll(NAVY, navy)}</svg>`;

// favicon.svg follows the browser theme: navy parts turn white on dark tab bars.
const faviconSvg = symbolSvg("currentColor", "")
  .replace("<svg ", `<svg color="${NAVY}" `)
  .replace(
    /^(<svg[^>]*>)/,
    `$1<style>@media (prefers-color-scheme: dark){svg{color:#fff}}</style>`,
  );
writeFileSync(join(pub, "favicon.svg"), faviconSvg);

const font = (pkg, file) =>
  pathToFileURL(join(root, "node_modules", pkg, "files", file)).href;

const tmp = mkdtempSync(join(tmpdir(), "brand-"));
const browser = await chromium.launch({ args: ["--disable-gpu"] });

async function render(html, width, height, out) {
  const file = join(tmp, "page.html");
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>
    @font-face{font-family:Barlow;font-weight:700;src:url(${font("@fontsource/barlow-condensed", "barlow-condensed-latin-700-normal.woff2")})}
    @font-face{font-family:Inter;font-weight:100 900;src:url(${font("@fontsource-variable/inter", "inter-latin-wght-normal.woff2")})}
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
  </style>${html}`);
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ path: out, omitBackground: true });
  await page.close();
  return buf;
}

const centred = (bg, pad, svg) =>
  `<div style="box-sizing:border-box;width:100%;height:100%;background:${bg};padding:${pad};display:flex;align-items:center;justify-content:center">
     <div style="height:100%;aspect-ratio:525/612">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></div>`;

await render(centred("#fff", "8%", symbolSvg()), 512, 512, join(pub, "icon-512.png"));
await render(centred("#fff", "8%", symbolSvg()), 192, 192, join(pub, "icon-192.png"));
await render(centred("#fff", "18%", symbolSvg()), 512, 512, join(pub, "icon-maskable-512.png"));
await render(centred("#fff", "10%", symbolSvg()), 180, 180, join(pub, "apple-touch-icon.png"));
const png32 = await render(centred("transparent", "0", symbolSvg()), 32, 32, join(tmp, "32.png"));
const png16 = await render(centred("transparent", "0", symbolSvg()), 16, 16, join(tmp, "16.png"));

// favicon.ico holding PNG images (supported by every current browser).
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size % 256, e); header.writeUInt8(size % 256, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}
writeFileSync(join(pub, "favicon.ico"), ico([{ size: 16, data: png16 }, { size: 32, data: png32 }]));

// OG image 1200x630: symbol and wordmark on navy with the circuit motif.
await render(
  `<div style="width:1200px;height:630px;background:${NAVY};display:flex;align-items:center;gap:64px;padding:0 96px;box-sizing:border-box;position:relative;overflow:hidden">
     <svg style="position:absolute;inset:0" width="1200" height="630" fill="none" stroke="${TEAL}" stroke-width="2" opacity=".35">
       <path d="M820,0 V90 L870,140 H1200"/><path d="M900,630 V520 L950,470 H1200"/><path d="M760,630 V560 L800,520 H880"/>
       <circle cx="880" cy="520" r="6" fill="${NAVY}"/><circle cx="870" cy="140" r="6" fill="${NAVY}"/>
     </svg>
     <div style="height:360px;aspect-ratio:525/612;position:relative">${symbolSvg("#fff").replace("<svg ", '<svg width="100%" height="100%" ')}</div>
     <div style="position:relative;color:#fff">
       <div style="font:700 150px/0.9 Barlow;letter-spacing:2px">AXELKOD</div>
       <div style="font:700 46px/1.2 Barlow;color:${TEAL};margin-top:24px;text-transform:uppercase;letter-spacing:1px">Delar. Kod. Säkerhet.</div>
       <div style="font:500 26px/1.4 Inter;color:#C3CDD6;margin-top:8px">Parts · Software · Cyber security</div>
     </div>
   </div>`,
  1200, 630, join(pub, "og-image.png"),
);

await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log("brand assets written to public/");

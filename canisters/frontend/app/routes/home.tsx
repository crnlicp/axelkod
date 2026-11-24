// Temporary design-system preview (Phase 1). Replaced by the real pages in Phase 2.
import { CircuitBackground } from "../components/CircuitBackground";
import {
  IconArrowRight, IconClock, IconCode, IconCompany, IconLock, IconMail,
  IconParts, IconPerson, IconPhone, IconPin, IconShield,
} from "../components/Icons";
import { Logo, LogoSymbol } from "../components/Logo";

export function meta() {
  return [{ title: "Axelkod AB" }, { name: "robots", content: "noindex" }];
}

const icons = [
  ["Parts", IconParts], ["Code", IconCode], ["Shield", IconShield], ["Person", IconPerson],
  ["Company", IconCompany], ["Lock", IconLock], ["Clock", IconClock], ["Mail", IconMail],
  ["Phone", IconPhone], ["Pin", IconPin],
] as const;

const swatches = [
  "bg-navy-950", "bg-navy-900", "bg-navy-800", "bg-navy-700", "bg-teal-700", "bg-teal-500",
  "bg-teal-300", "bg-grey-600", "bg-grey-400", "bg-grey-200", "bg-grey-50",
];

export default function Home() {
  return (
    <main>
      <section className="relative isolate overflow-hidden border-b border-border">
        <CircuitBackground className="-z-10" />
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-20 text-center">
          <LogoSymbol className="h-24 w-auto text-fg" />
          <h1 className="text-5xl uppercase sm:text-7xl">Delar. Kod. Säkerhet.</h1>
          <p className="max-w-xl text-lg text-muted">
            Fordonsdelar, mjukvara och cybersäkerhet – från ett svenskt bolag.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="#kontakt" className="btn btn-primary">
              Kontakta oss <IconArrowRight className="h-5 w-5" />
            </a>
            <a href="#" className="btn btn-secondary">Sekundär knapp</a>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-12 px-6 py-12">
        <section className="grid gap-6 sm:grid-cols-[12rem_1fr] sm:items-center">
          <Logo className="h-auto w-48 text-fg" />
          <div className="space-y-2">
            <h2 className="text-4xl">Rubrik H2 i Barlow Condensed</h2>
            <h3 className="text-2xl">Rubrik H3</h3>
            <p className="text-muted">
              Brödtext i Inter. Åäö ÅÄÖ. <a href="#">En länk i accentfärg</a> med
              tillräcklig kontrast.
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[[IconParts, "Fordonsdelar"], [IconCode, "Mjukvara"], [IconShield, "Cybersäkerhet"]].map(
            ([I, label]) => {
              const C = I as typeof IconParts;
              return (
                <div key={label as string} className="card">
                  <C className="h-10 w-10 text-brand" />
                  <h3 className="mt-4 text-2xl">{label as string}</h3>
                  <p className="mt-1 text-muted">En mening om vad vi gör.</p>
                </div>
              );
            },
          )}
        </section>

        <section className="flex flex-wrap gap-6">
          {icons.map(([name, I]) => (
            <div key={name} className="flex flex-col items-center gap-1 text-sm text-muted">
              <I className="h-8 w-8 text-fg" />
              {name}
            </div>
          ))}
        </section>

        <section className="flex flex-wrap gap-2">
          {swatches.map((s) => (
            <div key={s} className={`h-12 w-12 rounded border border-border ${s}`} title={s} />
          ))}
        </section>
      </div>
    </main>
  );
}

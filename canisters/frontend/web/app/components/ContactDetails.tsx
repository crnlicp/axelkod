import type { PublicContact } from "../bindings/site";
import { useRef } from "react";
import { dict, type Lang } from "../lib/i18n";
import { useSpotlight } from "../lib/spotlight";
import { IconCompany, IconMail, IconPhone, IconPin } from "./Icons";

export function ContactDetails({ lang, contact: c }: { lang: Lang; contact: PublicContact | null }) {
  const t = dict(lang).contactDetails;
  const ref = useRef<HTMLElement>(null);
  useSpotlight(ref, !!c);
  if (!c) return null;
  const hasCoords = c.mapLat !== undefined && c.mapLon !== undefined;
  const address = [c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean);
  return (
    <aside ref={ref} className="spotlight card relative h-fit overflow-hidden" aria-labelledby="contact-details-title">
      {c.mapUrl && (
        <div className="contact-map absolute inset-0" aria-hidden="true">
          <img src={c.mapUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          <span className="contact-map__pin" />
        </div>
      )}
      <h3 id="contact-details-title" className="text-2xl">{t.title}</h3>
      <dl className="mt-4 space-y-4">
        {c.email && (
          <div className="relative pl-9">
            <dt className="text-sm text-muted"><IconMail className="absolute left-0 top-0.5 h-6 w-6 text-brand" />{t.email}</dt>
            <dd><a href={`mailto:${c.email}`}>{c.email}</a></dd>
          </div>
        )}
        {c.phone && (
          <div className="relative pl-9">
            <dt className="text-sm text-muted"><IconPhone className="absolute left-0 top-0.5 h-6 w-6 text-brand" />{t.phone}</dt>
            <dd><a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a></dd>
          </div>
        )}
        <div className="relative pl-9">
            <dt className="text-sm text-muted"><IconPin className="absolute left-0 top-0.5 h-6 w-6 text-brand" />{t.address}</dt>
            <dd>
              {address.map((line) => <span key={line} className="block">{line}</span>)}
            </dd>
          </div>
        {c.orgNumber && (
          <div className="relative pl-9">
            <dt className="text-sm text-muted"><IconCompany className="absolute left-0 top-0.5 h-6 w-6 text-brand" />{t.orgNumber}</dt>
            <dd>{c.orgNumber}</dd>
          </div>
        )}
      </dl>
      {(hasCoords || c.mapUrl) && (
        <div className="mt-6 flex items-end justify-between gap-4">
          {hasCoords ? (
            <a href={`https://www.google.com/maps/search/?api=1&query=${c.mapLat},${c.mapLon}`}
              target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold">
              {t.openMap} <span aria-hidden="true">↗</span><span className="sr-only"> ({t.newTab})</span>
            </a>
          ) : <span />}
          {c.mapUrl && (
            <p className="text-xs text-muted">
              © <a href="https://www.openstreetmap.org/copyright" className="text-muted" rel="noopener noreferrer" target="_blank">OpenStreetMap</a>
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

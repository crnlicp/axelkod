import type { PublicContact } from "../bindings/backend";
import { dict, type Lang } from "../lib/i18n";
import { IconCompany, IconMail, IconPhone, IconPin } from "./Icons";

export function ContactDetails({ lang, contact: c }: { lang: Lang; contact: PublicContact | null }) {
  const t = dict(lang).contactDetails;
  if (!c) return null;
  const address = [c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean);
  return (
    <aside className="card h-fit" aria-labelledby="contact-details-title">
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
            <dd>{address.map((line) => <span key={line} className="block">{line}</span>)}</dd>
          </div>
        {c.orgNumber && (
          <div className="relative pl-9">
            <dt className="text-sm text-muted"><IconCompany className="absolute left-0 top-0.5 h-6 w-6 text-brand" />{t.orgNumber}</dt>
            <dd>{c.orgNumber}</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}

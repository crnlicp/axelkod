import type { PublicConfig } from "../bindings/backend";
import { dict, type Lang } from "../lib/i18n";
import { IconCompany, IconMail, IconPhone, IconPin } from "./Icons";

export function ContactDetails({ lang, config }: { lang: Lang; config: PublicConfig | null }) {
  const t = dict(lang).contactDetails;
  if (!config) return null;
  const c = config.contact;
  const address = [c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean);
  return (
    <aside className="card h-fit" aria-labelledby="contact-details-title">
      <h3 id="contact-details-title" className="text-2xl">{t.title}</h3>
      <dl className="mt-4 space-y-4">
        {c.email && (
          <div className="flex gap-3">
            <IconMail className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
            <div>
              <dt className="text-sm text-muted">{t.email}</dt>
              <dd><a href={`mailto:${c.email}`}>{c.email}</a></dd>
            </div>
          </div>
        )}
        {c.phone && (
          <div className="flex gap-3">
            <IconPhone className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
            <div>
              <dt className="text-sm text-muted">{t.phone}</dt>
              <dd><a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a></dd>
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <IconPin className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
          <div>
            <dt className="text-sm text-muted">{t.address}</dt>
            <dd>{address.map((line) => <span key={line} className="block">{line}</span>)}</dd>
          </div>
        </div>
        {c.orgNumber && (
          <div className="flex gap-3">
            <IconCompany className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
            <div>
              <dt className="text-sm text-muted">{t.orgNumber}</dt>
              <dd>{c.orgNumber}</dd>
            </div>
          </div>
        )}
      </dl>
    </aside>
  );
}

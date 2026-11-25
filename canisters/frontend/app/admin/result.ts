// Shared handling of the backend's Result<T, Error> in the admin.
import type { AdminDict } from "./i18n";

export type BackendErr = { __kind__: string; invalid?: string; frontend?: string; conflict?: string };

export function errMessage(e: BackendErr, t: AdminDict): string {
  const x = t.errors;
  switch (e.__kind__) {
    case "invalid": return x.invalid(fieldLabel(e.invalid ?? "", t));
    case "notAuthorized": return x.notAuthorized;
    case "notFound": return x.notFound;
    case "lastAdmin": return x.lastAdmin;
    case "conflict": return e.conflict === "slug" ? x.slugTaken : x.conflict(e.conflict ?? "");
    case "frontend": return x.frontend(e.frontend ?? "");
    default: return e.__kind__;
  }
}

/** "sv.title" -> "Svenska: titel". */
export function fieldLabel(field: string, t: AdminDict): string {
  if (field in t.errors.fields) return t.errors.fields[field];
  const [lang, key] = field.split(".");
  if (key && (lang === "sv" || lang === "en")) return `${lang === "sv" ? t.langSv : t.langEn}: ${t.errors.langFields[key] ?? key}`;
  return field;
}

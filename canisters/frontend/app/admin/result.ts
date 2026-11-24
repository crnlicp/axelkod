// Shared handling of the backend's Result<T, Error> in the admin.
export type BackendErr = { __kind__: string; invalid?: string; frontend?: string };

const fieldNames: Record<string, string> = {
  email: "E-post", phone: "Telefon", street: "Gatuadress", postalCode: "Postnummer", city: "Ort", orgNumber: "Org.nr",
  organisationName: "Organisationsnamn", logoUrl: "Logotyp-URL", sameAs: "Profiler (sameAs)",
  googleVerification: "Google-verifiering", bingVerification: "Bing-verifiering",
  retentionMonths: "Lagringstid", "responseTime.sv": "Svarstid (svenska)", "responseTime.en": "Svarstid (engelska)", principal: "ID",
};

export function errMessage(e: BackendErr): string {
  switch (e.__kind__) {
    case "invalid": return `Ogiltigt värde: ${fieldLabel(e.invalid ?? "")}`;
    case "notAuthorized": return "Du har inte behörighet.";
    case "notFound": return "Hittades inte.";
    case "lastAdmin": return "Den sista administratören kan inte tas bort.";
    case "frontend": return `Frontend-canistern svarade: ${e.frontend}`;
    default: return e.__kind__;
  }
}

const seoFields: Record<string, string> = {
  title: "titel", metaDescription: "metabeskrivning", keywords: "nyckelord", ogTitle: "OG-titel",
  ogDescription: "OG-beskrivning", ogImageUrl: "OG-bild", canonicalBaseUrl: "kanonisk bas-URL",
};

/** "sv.title" -> "Svenska: titel". */
export function fieldLabel(field: string): string {
  if (field in fieldNames) return fieldNames[field];
  const [lang, key] = field.split(".");
  if (key && (lang === "sv" || lang === "en")) return `${lang === "sv" ? "Svenska" : "Engelska"}: ${seoFields[key] ?? key}`;
  return fieldNames[field] ?? field;
}

// Shared handling of the backend's Result<T, Error> in the admin.
export type BackendErr = { __kind__: string; invalid?: string; frontend?: string };

const fieldNames: Record<string, string> = {
  email: "E-post", phone: "Telefon", street: "Gatuadress", postalCode: "Postnummer", city: "Ort", orgNumber: "Org.nr",
};

export function errMessage(e: BackendErr): string {
  switch (e.__kind__) {
    case "invalid": return `Ogiltigt värde: ${fieldNames[e.invalid ?? ""] ?? e.invalid}`;
    case "notAuthorized": return "Du har inte behörighet.";
    case "notFound": return "Hittades inte.";
    case "lastAdmin": return "Den sista administratören kan inte tas bort.";
    case "frontend": return `Frontend-canistern svarade: ${e.frontend}`;
    default: return e.__kind__;
  }
}

// Mirrors the canister's rules (lib/Contact.mo) so users get instant feedback.
// The canister validates again; this is only for usability.
export const LIMITS = { name: 100, company: 100, message: 2000 } as const;

export type Fields = {
  name: string;
  email: string;
  phone: string;
  company: string;
  area: string;
  message: string;
  consent: boolean;
};
export type FieldName = keyof Fields;

const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029]/g;
export const clean = (s: string) => s.replace(CONTROL, "").trim();

export function validate(f: Fields): FieldName[] {
  const bad: FieldName[] = [];
  const name = clean(f.name);
  if (name.length < 1 || name.length > LIMITS.name) bad.push("name");
  const email = clean(f.email);
  const [local, domain, ...rest] = email.split("@");
  const domainOk = !!domain && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
  if (email.length < 6 || email.length > 254 || /\s/.test(email) || rest.length > 0 || !local || !domainOk)
    bad.push("email");
  const phone = clean(f.phone);
  if (phone && !/^[\d +\-()]{5,40}$/.test(phone)) bad.push("phone");
  if (clean(f.company).length > LIMITS.company) bad.push("company");
  if (!["parts", "software", "security", "other"].includes(f.area)) bad.push("area");
  const message = clean(f.message);
  if (message.length < 1 || message.length > LIMITS.message) bad.push("message");
  if (!f.consent) bad.push("consent");
  return bad;
}

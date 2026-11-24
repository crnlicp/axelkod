import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { SubmitError } from "../bindings/backend";
import { LIMITS, clean, validate, type FieldName, type Fields } from "../lib/contactValidation";
import { dict, fmt, PATHS, type Lang } from "../lib/i18n";

const MIN_AGE_MS = 3_100; // the canister rejects tokens younger than 3 s

type Token = { value: string; at: number };
type Status = { kind: "idle" | "sending" | "error" | "done"; text?: string };

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchToken(): Promise<Token | SubmitError> {
  const { backend } = await import("../lib/backend");
  const res = await backend().getFormToken(nonce());
  return res.__kind__ === "ok" ? { value: res.ok, at: Date.now() } : res.err;
}

const empty: Fields = { name: "", email: "", phone: "", company: "", area: "", message: "", consent: false };

export function ContactForm({ lang, responseTime }: { lang: Lang; responseTime: string | null }) {
  const t = dict(lang);
  const f = t.form;
  const [fields, setFields] = useState<Fields>(empty);
  const [invalid, setInvalid] = useState<FieldName[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const honeypot = useRef<HTMLInputElement>(null);
  const token = useRef<Promise<Token | SubmitError> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);

  // Fetch the token once the page has loaded; the 3 s minimum runs from here.
  useEffect(() => {
    token.current = fetchToken().catch(() => ({ __kind__: "unavailable", unavailable: null }) as SubmitError);
  }, []);

  useEffect(() => {
    if (status.kind === "done") doneRef.current?.focus();
  }, [status.kind]);

  const set = <K extends FieldName>(k: K, v: Fields[K]) => {
    setFields((prev) => ({ ...prev, [k]: v }));
    if (invalid.includes(k)) setInvalid((prev) => prev.filter((x) => x !== k));
  };

  function errorText(e: SubmitError): string {
    switch (e.__kind__) {
      case "invalid":
        return f.errors[e.invalid as keyof typeof f.errors] ?? f.errors.summary;
      case "rateLimited":
        return f.errors.rateLimited;
      case "unavailable":
        return f.errors.unavailable;
      default:
        return f.errors.network;
    }
  }

  async function send(tok: Token) {
    const { backend } = await import("../lib/backend");
    const { Area, Lang: LangEnum } = await import("../bindings/backend");
    const wait = MIN_AGE_MS - (Date.now() - tok.at);
    if (wait > 0) await sleep(wait);
    return backend().submitContact(
      {
        name: clean(fields.name),
        email: clean(fields.email),
        phone: clean(fields.phone) || undefined,
        company: clean(fields.company) || undefined,
        area: Area[fields.area as keyof typeof Area],
        message: fields.message.trim(),
        lang: lang === "en" ? LangEnum.en : LangEnum.sv,
        consent: fields.consent,
        website: honeypot.current?.value ?? "",
      },
      tok.value,
    );
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const bad = validate(fields);
    setInvalid(bad);
    if (bad.length > 0) {
      setStatus({ kind: "error", text: f.errors.summary });
      formRef.current?.querySelector<HTMLElement>(`[name="${bad[0]}"]`)?.focus();
      return;
    }
    setStatus({ kind: "sending" });
    try {
      let tok = await (token.current ?? fetchToken());
      if (!("value" in tok)) throw tok;
      let res = await send(tok);
      // A token that expired (tab left open) or was used: get a fresh one and retry once.
      if (res.__kind__ === "err" && ["tokenExpired", "tokenUsed", "tokenInvalid", "tokenTooFast"].includes(res.err.__kind__)) {
        token.current = fetchToken();
        tok = await token.current;
        if (!("value" in tok)) throw tok;
        res = await send(tok);
      }
      if (res.__kind__ === "ok") {
        setStatus({ kind: "done" });
        token.current = null;
        return;
      }
      if (res.err.__kind__ === "invalid") setInvalid([res.err.invalid as FieldName]);
      setStatus({ kind: "error", text: errorText(res.err) });
    } catch (e) {
      const known = e && typeof e === "object" && "__kind__" in e;
      setStatus({ kind: "error", text: known ? errorText(e as SubmitError) : f.errors.network });
    }
  }

  if (status.kind === "done") {
    return (
      <div className="card mt-8" role="status">
        <p ref={doneRef} tabIndex={-1} className="font-display text-3xl font-bold uppercase outline-none">
          {f.thanks}
        </p>
        <p className="mt-2 text-lg">{responseTime ?? t.why.items[3].text}</p>
      </div>
    );
  }

  const describe = (k: FieldName, extra?: string) =>
    [invalid.includes(k) ? `${k}-error` : null, extra].filter(Boolean).join(" ") || undefined;
  const fieldError = (k: FieldName) =>
    invalid.includes(k) ? (
      <p id={`${k}-error`} className="mt-1 text-sm font-medium text-[var(--error)]">
        {f.errors[k as keyof typeof f.errors]}
      </p>
    ) : null;
  const label = (k: FieldName, text: string, optional = false) => (
    <label htmlFor={`cf-${k}`} className="block font-medium">
      {text} {optional ? <span className="text-sm font-normal text-muted">({f.optional})</span> : <span aria-hidden="true">*</span>}
    </label>
  );
  const input = "mt-1 w-full rounded-md border border-[var(--input-border)] bg-bg px-3 py-2.5 text-fg aria-[invalid=true]:border-[var(--error)]";
  const messageLength = clean(fields.message).length;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-8 space-y-5" aria-describedby="cf-required">
      <p id="cf-required" className="text-sm text-muted">
        * = {f.required}
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          {label("name", f.name)}
          <input id="cf-name" name="name" autoComplete="name" required maxLength={LIMITS.name} className={input}
            value={fields.name} onChange={(e) => set("name", e.target.value)}
            aria-invalid={invalid.includes("name")} aria-describedby={describe("name")} />
          {fieldError("name")}
        </div>
        <div>
          {label("email", f.email)}
          <input id="cf-email" name="email" type="email" autoComplete="email" required maxLength={254} className={input}
            value={fields.email} onChange={(e) => set("email", e.target.value)}
            aria-invalid={invalid.includes("email")} aria-describedby={describe("email")} />
          {fieldError("email")}
        </div>
        <div>
          {label("phone", f.phone, true)}
          <input id="cf-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} className={input}
            value={fields.phone} onChange={(e) => set("phone", e.target.value)}
            aria-invalid={invalid.includes("phone")} aria-describedby={describe("phone")} />
          {fieldError("phone")}
        </div>
        <div>
          {label("company", f.company, true)}
          <input id="cf-company" name="company" autoComplete="organization" maxLength={LIMITS.company} className={input}
            value={fields.company} onChange={(e) => set("company", e.target.value)}
            aria-invalid={invalid.includes("company")} aria-describedby={describe("company")} />
          {fieldError("company")}
        </div>
      </div>
      <div>
        {label("area", f.area)}
        <select id="cf-area" name="area" required className={input} value={fields.area}
          onChange={(e) => set("area", e.target.value)}
          aria-invalid={invalid.includes("area")} aria-describedby={describe("area")}>
          <option value="">{f.areaPlaceholder}</option>
          {(["parts", "software", "security", "other"] as const).map((a) => (
            <option key={a} value={a}>{f.areas[a]}</option>
          ))}
        </select>
        {fieldError("area")}
      </div>
      <div>
        {label("message", f.message)}
        <textarea id="cf-message" name="message" required rows={6} maxLength={LIMITS.message} className={input}
          value={fields.message} onChange={(e) => set("message", e.target.value)}
          aria-invalid={invalid.includes("message")} aria-describedby={describe("message", "cf-message-count")} />
        <p id="cf-message-count" className="mt-1 text-right text-sm text-muted">
          {fmt(f.counter, { count: messageLength, max: LIMITS.message })}
        </p>
        {fieldError("message")}
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots tend to fill every field. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor="cf-website">{f.honeypot}</label>
        <input ref={honeypot} id="cf-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div>
        <div className="flex items-start gap-3">
          <input id="cf-consent" name="consent" type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-teal-700)]"
            checked={fields.consent} onChange={(e) => set("consent", e.target.checked)}
            aria-invalid={invalid.includes("consent")} aria-describedby={describe("consent")} />
          <label htmlFor="cf-consent">
            {f.consentBefore}
            <Link to={PATHS.privacy[lang]}>{f.consentLink}</Link>. <span aria-hidden="true">*</span>
          </label>
        </div>
        {fieldError("consent")}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={status.kind === "sending"}>
          {status.kind === "sending" ? f.sending : f.submit}
        </button>
        <p role="status" aria-live="polite" className={status.kind === "error" ? "font-medium text-[var(--error)]" : "text-muted"}>
          {status.kind === "error" ? status.text : status.kind === "sending" ? f.sending : ""}
        </p>
      </div>
    </form>
  );
}

import { Fragment, type ReactNode } from "react";
import { parse, type Inline } from "../lib/md";

function inline(c: Inline[]): ReactNode {
  return c.map((n, i) => {
    switch (n.t) {
      case "text": return <Fragment key={i}>{n.v}</Fragment>;
      case "code": return <code key={i}>{n.v}</code>;
      case "strong": return <strong key={i}>{inline(n.c)}</strong>;
      case "em": return <em key={i}>{inline(n.c)}</em>;
      case "link":
        return n.href.startsWith("https://")
          ? <a key={i} href={n.href} rel="noopener noreferrer">{inline(n.c)}</a>
          : <a key={i} href={n.href}>{inline(n.c)}</a>;
    }
  });
}

/** Renders the safe Markdown subset; markup matches md.ts toHtml() for hydration. */
export function Markdown({ body, className = "" }: { body: string; className?: string }) {
  return (
    <div className={`prose-ax ${className}`}>
      {parse(body).map((b, i) => {
        switch (b.t) {
          case "h2": return <h2 key={i}>{inline(b.c)}</h2>;
          case "h3": return <h3 key={i}>{inline(b.c)}</h3>;
          case "quote": return <blockquote key={i}>{inline(b.c)}</blockquote>;
          case "ul": return <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>;
          case "ol": return <ol key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>;
          default: return <p key={i}>{inline(b.c)}</p>;
        }
      })}
    </div>
  );
}

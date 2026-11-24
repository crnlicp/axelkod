// News methods on the local canister, as a throwaway admin.
import { expect, test } from "@playwright/test";
import { Lang, NewsArea, NewsStatus, type NewsInput } from "../../app/bindings/backend";
import { anonBackend, apiAdmin } from "../support/local";

test("news: create, update, visibility rules, conflicts, auth", async () => {
  const api = await apiAdmin();
  const anon = anonBackend();
  const tag = `t${Date.now()}`;
  const base: NewsInput = {
    slug: `${tag}-nyhet`,
    status: NewsStatus.published,
    publishedAt: BigInt(Date.now() - 60_000) * 1_000_000n,
    area: NewsArea.security,
    coverUrl: "/uploads/og-1.png",
    sv: { title: `Nyhet ${tag}`, excerpt: "Kort ingress.", body: "Hej **världen**.", coverAlt: "" },
    en: { title: `News ${tag}`, excerpt: "Short lead.", body: "Hello.", coverAlt: "" },
  };
  const created: bigint[] = [];
  try {
    const before = await api.actor.getSeoSettings();
    const a = await api.actor.createNews(base);
    if (a.__kind__ !== "ok") throw new Error(a.err.__kind__);
    created.push(a.ok.id);
    const after = await api.actor.getSeoSettings();
    if (before.__kind__ === "ok" && after.__kind__ === "ok") expect(after.ok.updatedAt).toBeGreaterThan(before.ok.updatedAt);

    expect(await api.actor.createNews(base)).toMatchObject({ __kind__: "err", err: { __kind__: "conflict" } });
    expect(await anon.createNews({ ...base, slug: `${tag}-x` })).toMatchObject({ __kind__: "err", err: { __kind__: "notAuthorized" } });

    // Swedish-only draft: hidden everywhere until published, then only on sv.
    const b = await api.actor.createNews({ ...base, slug: `${tag}-svenska`, status: NewsStatus.draft, en: undefined });
    if (b.__kind__ !== "ok") throw new Error(b.err.__kind__);
    created.push(b.ok.id);
    expect(await anon.getNews(`${tag}-svenska`, Lang.sv)).toBeNull();
    const pub = await api.actor.updateNews(b.ok.id, { ...base, slug: `${tag}-svenska`, en: undefined });
    expect(pub.__kind__).toBe("ok");
    expect((await anon.getNews(`${tag}-svenska`, Lang.sv))?.summary.hasOtherLang).toBe(false);
    expect(await anon.getNews(`${tag}-svenska`, Lang.en)).toBeNull();

    const sv = await anon.listNews(Lang.sv, 0n, 50n);
    expect(sv.items.map((i) => i.slug)).toEqual(expect.arrayContaining([`${tag}-nyhet`, `${tag}-svenska`]));
    const en = await anon.listNews(Lang.en, 0n, 50n);
    expect(en.items.map((i) => i.slug)).toContain(`${tag}-nyhet`);
    expect(en.items.map((i) => i.slug)).not.toContain(`${tag}-svenska`);
    expect((await anon.publishedNews()).some((n) => n.slug === `${tag}-nyhet`)).toBe(true);
    expect(await anon.adminListNews()).toMatchObject({ __kind__: "err", err: { __kind__: "notAuthorized" } });
  } finally {
    for (const id of created) await api.actor.deleteNews(id);
    api.revoke();
  }
});

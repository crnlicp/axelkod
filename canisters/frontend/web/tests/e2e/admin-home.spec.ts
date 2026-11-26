import { expect, test } from "@playwright/test";
import { HomeKey } from "../../app/bindings/site";
import { apiAdmin, signInAsAdmin } from "../support/local";

// Edits all three home sections in the admin, publishes, and checks the baked site:
// an added service card, a fifth security layer (ring + hover sync), industry columns.
test("admin edits home sections, publishes, and the site shows them", async ({ page, context, browser }) => {
  test.setTimeout(180_000);
  const api = await apiAdmin();
  const original = await api.actor.adminGetHome();
  if (original.__kind__ !== "ok") throw new Error(original.err.__kind__);
  const live = (await api.actor.getHome()).services.items.length;
  const tag = `T${Date.now()}`;
  const session = await signInAsAdmin(page, context);
  try {
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Startsida" }).click();
    await expect(page).toHaveURL(/\/admin\/home$/);
    await page.getByRole("tab", { name: "Vad vi gör" }).click();

    // Services: add a card with an icon, in both languages.
    await page.getByRole("button", { name: "+ Lägg till kort" }).click();
    const card = page.getByTestId("home-items").getByRole("listitem").last();
    await card.getByLabel("Titel").fill(`Tjänst ${tag}`);
    await card.getByLabel("Text").fill("Svensk text.");
    await card.getByRole("button", { name: /Välj ikon/ }).click();
    await card.getByRole("option", { name: "cloud" }).click();
    // Saving with the English text missing names the field.
    await page.getByRole("button", { name: "Spara", exact: true }).click();
    const n = original.ok.services.items.length + 1;
    await expect(page.getByRole("status").filter({ hasText: `Kort ${n} (Engelska): titel saknas` })).toBeVisible();
    await page.getByRole("tab", { name: /Engelska/ }).click();
    await card.getByLabel("Titel").fill(`Service ${tag}`);
    await card.getByLabel("Text").fill("English text.");
    await page.getByRole("button", { name: "Spara", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat." })).toBeVisible();

    // Security: a fifth layer.
    await page.getByRole("tab", { name: "Säkerhetslager" }).click();
    await page.getByRole("tab", { name: /Svenska/ }).click();
    await page.getByRole("button", { name: "+ Lägg till lager" }).click();
    const layer = page.getByTestId("home-items").getByRole("listitem").last();
    await layer.getByLabel("Titel").fill(`Lager ${tag}`);
    await layer.getByLabel("Text").fill(`Lagertext ${tag}`);
    await page.getByRole("tab", { name: /Engelska/ }).click();
    await layer.getByLabel("Titel").fill(`Layer ${tag}`);
    await layer.getByLabel("Text").fill(`Layer text ${tag}`);
    await page.getByRole("button", { name: "Spara", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat." })).toBeVisible();

    // Industries: remove the last one.
    await page.getByRole("tab", { name: "Branscher" }).click();
    page.once("dialog", (d) => void d.accept());
    const industries = original.ok.industries.items.length;
    await page.getByRole("button", { name: `Ta bort: Kort ${industries}` }).click();
    await page.getByRole("button", { name: "Spara", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat." })).toBeVisible();

    // Drafts stay off the public query until Publish.
    expect((await api.actor.getHome()).services.items).toHaveLength(live);
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "SEO" }).click();
    await page.getByRole("button", { name: "Publicera", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Publicerat." })).toBeVisible({ timeout: 60_000 });
    expect((await api.actor.getHome()).services.items).toHaveLength(n);

    // The baked page (fresh context, no cache) shows all three changes.
    const site = await (await browser.newContext()).newPage();
    await site.goto("/", { waitUntil: "networkidle" });
    await expect(site.locator("#tjanster h3", { hasText: `Tjänst ${tag}` })).toBeVisible();
    const sec = site.locator("#sakerhet");
    const layers = original.ok.security.items.length + 1;
    await expect(sec.locator("polygon.layer-ring")).toHaveCount(layers);
    await sec.scrollIntoViewIfNeeded();
    // The outermost ring's band, near its top corner (inner rings sit on top elsewhere).
    const outer = sec.locator(`polygon[data-layer="${layers - 1}"]`);
    const box = (await outer.boundingBox())!;
    await outer.hover({ position: { x: box.width / 2, y: 6 }, force: true });
    await expect(sec.getByRole("button", { name: new RegExp(`Lager ${tag}`) })).toHaveAttribute("aria-pressed", "true");
    await expect(sec.locator("#security-panel")).toHaveText(`Lagertext ${tag}`);
    await sec.getByRole("button", { name: /Kod/ }).hover();
    await expect(sec.locator('polygon[data-layer="0"]')).toHaveAttribute("data-active", "");
    await expect(site.locator("#branscher ul > li")).toHaveCount(industries - 1);
    await site.goto("/en", { waitUntil: "networkidle" });
    await expect(site.locator("#services h3", { hasText: `Service ${tag}` })).toBeVisible();
  } finally {
    for (const key of ["services", "security", "industries"] as const) {
      await api.actor.setHomeSection(HomeKey[key], original.ok[key]);
    }
    // Republish so the live pages drop the test content again.
    await page.goto("/admin/seo");
    await page.getByRole("button", { name: "Publicera", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Publicerat." })).toBeVisible({ timeout: 60_000 });
    expect((await api.actor.getHome()).services.items).toHaveLength(original.ok.services.items.length);
    await session.revoke();
    await api.revoke();
  }
});

test("contact card shows the map snapshot only when one is set", async ({ page }) => {
  const api = await apiAdmin();
  const original = await api.actor.getContactInfo();
  if (original.__kind__ !== "ok") throw new Error(original.err.__kind__);
  try {
    // Start without a map, whatever is configured (restored below).
    await api.actor.setContactInfo({ ...original.ok, mapLat: undefined, mapLon: undefined, mapUrl: undefined });
    await page.goto("/#kontakt", { waitUntil: "networkidle" });
    await expect(page.locator(".contact-map")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Visa på karta/ })).toHaveCount(0);
    const r = await api.actor.setContactInfo({ ...original.ok, mapLat: 57.6554, mapLon: 12.0138, mapUrl: "/uploads/og-image.png" });
    expect(r.__kind__).toBe("ok");
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".contact-map img")).toHaveAttribute("src", "/uploads/og-image.png");
    await expect(page.getByRole("link", { name: "OpenStreetMap" })).toBeVisible();
    const open = page.getByRole("link", { name: /Visa på karta/ });
    await expect(open).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=57.6554,12.0138");
    await expect(open).toHaveAttribute("target", "_blank");
  } finally {
    await api.actor.setContactInfo(original.ok);
    await api.revoke();
  }
});

test("admin edits the hero and trust points, publishes, and the site shows them", async ({ page, context, browser }) => {
  test.setTimeout(180_000);
  const api = await apiAdmin();
  const original = await api.actor.adminGetHome();
  if (original.__kind__ !== "ok") throw new Error(original.err.__kind__);
  const tag = `H${Date.now() % 100000}`;
  const session = await signInAsAdmin(page, context);
  try {
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Startsida" }).click();
    await expect(page.getByRole("tab", { name: "Hero" })).toHaveAttribute("aria-selected", "true");

    // A new last headline word, highlighted.
    await page.getByRole("button", { name: "+ Lägg till ord" }).click();
    const words = page.getByLabel(/^Ord \d$/);
    const last = (await words.count()) - 1;
    await words.nth(last).fill(tag);
    await page.getByRole("radio").nth(last).check();
    await page.getByRole("tab", { name: /Engelska/ }).click();
    await page.getByRole("button", { name: "+ Lägg till ord" }).click();
    await page.getByLabel(/^Ord \d$/).nth(last).fill(`${tag}en`);

    // A new trust point in both languages.
    await page.getByRole("button", { name: "+ Lägg till punkt" }).click();
    const point = page.getByTestId("hero-trust").getByRole("listitem").last();
    await point.getByLabel("Titel").fill(`Trust ${tag}`);
    await point.getByLabel("Text").fill("English point.");
    await page.getByRole("tab", { name: /Svenska/ }).click();
    await point.getByLabel("Titel").fill(`Förtroende ${tag}`);
    await point.getByLabel("Text").fill("Svensk punkt.");
    await page.getByRole("button", { name: "Spara", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat." })).toBeVisible();

    // Publish straight from the home editor.
    await page.getByRole("button", { name: "Publicera", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Publicerat." })).toBeVisible({ timeout: 60_000 });

    const site = await (await browser.newContext()).newPage();
    await site.goto("/", { waitUntil: "networkidle" });
    await expect(site.locator("h1 .text-gradient")).toHaveText(tag);
    await expect(site.getByText(`Förtroende ${tag}`)).toBeVisible();
    await site.goto("/en", { waitUntil: "networkidle" });
    await expect(site.locator("h1 .text-gradient")).toHaveText(`${tag}en`);
  } finally {
    await api.actor.setHomeHero(original.ok.hero);
    await page.goto("/admin/seo");
    await page.getByRole("button", { name: "Publicera", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Publicerat." })).toBeVisible({ timeout: 60_000 });
    await session.revoke();
    await api.revoke();
  }
});

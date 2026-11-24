import { expect, test } from "@playwright/test";
import { Lang } from "../../app/bindings/backend";
import { anonBackend, signInAsAdmin } from "../support/local";

test("admin writes, edits and deletes a news article", async ({ page, context }) => {
  test.setTimeout(120_000);
  const session = await signInAsAdmin(page, context);
  const anon = anonBackend();
  const title = `Öppet hus på verkstaden ${Date.now()}`;
  const slug = title.toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "-");
  try {
    await page.getByRole("link", { name: "Nyheter" }).click();
    await page.getByRole("link", { name: "Ny nyhet" }).click();
    await expect(page).toHaveURL(/\/admin\/news\/new$/);

    await page.getByLabel("Rubrik").fill(title);
    await expect(page.getByLabel("Adress (slug)")).toHaveValue(slug); // generated from the title
    await page.getByLabel("Ingress (visas på korten)").fill("Välkommen in i vår nya verkstad.");
    await page.getByLabel("Brödtext").fill("## Program\n\n- Visning\n- **Fika**\n\nLäs [integritetspolicyn](/integritet).");
    const preview = page.getByRole("region", { name: /Förhandsvisning/ });
    await expect(preview.locator(".prose-ax h2")).toHaveText("Program");
    await expect(preview.locator("strong")).toHaveText("Fika");
    await page.getByLabel("Status").selectOption("published");
    await page.getByLabel("Område (valfritt)").selectOption("parts");
    await page.locator("#nw-file").setInputFiles("public/og-image.png");
    await expect(page.getByRole("status").filter({ hasText: "Bilden är uppladdad." })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Omslagsbild (valfritt)")).toHaveValue(/^\/uploads\/news-\d+\.png$/);
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat." })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/news\/\d+$/);

    // Public: Swedish only so far.
    expect((await anon.getNews(slug, Lang.sv))?.summary.title).toBe(title);
    expect(await anon.getNews(slug, Lang.en)).toBeNull();

    await page.getByLabel("Engelsk version").check();
    await page.getByRole("tab", { name: "Engelska" }).click();
    await page.getByLabel("Rubrik").fill("Open house at the workshop");
    await page.getByLabel("Ingress (visas på korten)").fill("Welcome to our new workshop.");
    await page.getByLabel("Brödtext").fill("Come and see us.");
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat." })).toBeVisible();
    expect((await anon.getNews(slug, Lang.en))?.summary.title).toBe("Open house at the workshop");

    await page.getByRole("link", { name: "← Alla nyheter" }).click();
    const list = page.getByTestId("news-list");
    await expect(list).toContainText(title);
    await expect(list).toContainText("Publicerad · Fordonsdelar · sv + en");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: `Radera ${title}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "Nyheten är raderad." })).toBeVisible();
    await expect(list).not.toContainText(title);
    expect(await anon.getNews(slug, Lang.sv)).toBeNull();
  } finally {
    session.revoke();
  }
});

import { expect, test } from "@playwright/test";
import { apiAdmin, signInAsAdmin } from "../support/local";

test("admin edits contact info: live preview, validation, public site updates", async ({ page, context }) => {
  test.setTimeout(90_000);
  const api = await apiAdmin();
  const original = await api.actor.getContactInfo();
  if (original.__kind__ !== "ok") throw new Error(original.err.__kind__);
  const session = await signInAsAdmin(page, context);
  try {
    await page.getByRole("link", { name: "Kontaktuppgifter" }).click();
    await expect(page).toHaveURL(/\/admin\/contact$/);
    const preview = page.getByTestId("contact-preview");

    // Live preview follows the form and the show flags.
    await page.getByLabel("Telefon", { exact: true }).fill("031-12 34 56");
    await page.getByLabel("Visa telefonnummer").uncheck();
    await expect(preview).not.toContainText("031-12 34 56");
    await page.getByLabel("Visa telefonnummer").check();
    await expect(preview).toContainText("031-12 34 56");
    await page.getByLabel("Org.nr").fill("559999-0001");
    await expect(preview).toContainText("559999-0001");

    // Server-side validation is shown on the field.
    await page.getByLabel("E-post", { exact: true }).fill("not-an-email");
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Ogiltigt värde: E-post" })).toBeVisible();
    await expect(page.getByLabel("E-post", { exact: true })).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("E-post", { exact: true }).fill("info@axelkod.eu");
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat." })).toBeVisible();

    // The public site reads it at runtime: no deploy or publish needed.
    const site = await context.newPage();
    await site.goto("/");
    await expect(site.locator("aside")).toContainText("031-12 34 56");
    await expect(site.locator("aside")).toContainText("info@axelkod.eu");
    await expect(site.locator("footer")).toContainText("559999-0001");
  } finally {
    await api.actor.setContactInfo(original.ok);
    session.revoke();
    api.revoke();
  }
});

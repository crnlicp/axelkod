import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { expect, test } from "@playwright/test";
import { apiAdmin, icp, signInAsAdmin } from "../support/local";

test("admin settings: retention + response time reach the site; admins are added and removed", async ({ page, context }) => {
  test.setTimeout(120_000);
  const api = await apiAdmin();
  const original = await api.actor.getSiteSettings();
  if (original.__kind__ !== "ok") throw new Error(original.err.__kind__);
  const session = await signInAsAdmin(page, context);
  try {
    await page.getByRole("link", { name: "Inställningar" }).click();
    await expect(page).toHaveURL(/\/admin\/settings$/);

    await page.getByLabel("Lagringstid för meddelanden (månader)").fill("61");
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByRole("status").filter({ hasText: "1–60 månader" })).toBeVisible();

    await page.getByLabel("Lagringstid för meddelanden (månader)").fill("6");
    await page.getByLabel("Svarstid (svenska)").fill("Vi svarar inom en arbetsdag.");
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sparat." })).toBeVisible();

    const site = await context.newPage();
    await site.goto("/integritet");
    await expect(site.getByText("raderas automatiskt efter 6 månader")).toBeVisible();

    // Admin management: invalid ID, add (mirrored to the frontend canister), remove.
    const list = page.getByTestId("admin-list");
    await expect(list).toContainText(session.principal);
    await expect(list).toContainText("· du");
    await page.getByLabel("Lägg till administratör (ID)").fill("not-a-principal");
    await page.getByRole("button", { name: "Lägg till" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Ogiltigt ID" })).toBeVisible();

    const other = Ed25519KeyIdentity.generate().getPrincipal().toText();
    await page.getByLabel("Lägg till administratör (ID)").fill(other);
    await page.getByRole("button", { name: "Lägg till" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Administratören är tillagd." })).toBeVisible();
    await expect(list).toContainText(other);
    expect(icp("canister", "call", "web", "list_authorized", "()")).toContain(other);

    page.once("dialog", (d) => { expect(d.message()).toContain(other); void d.accept(); });
    await page.getByRole("button", { name: `Ta bort ${other}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "Administratören är borttagen." })).toBeVisible();
    await expect(list).not.toContainText(other);
    expect(icp("canister", "call", "web", "list_authorized", "()")).not.toContain(other);

    // Removing yourself asks first; dismissing keeps access.
    page.once("dialog", (d) => { expect(d.message()).toContain("dig själv"); void d.dismiss(); });
    await page.getByRole("button", { name: `Ta bort ${session.principal}` }).click();
    await expect(list).toContainText(session.principal);
  } finally {
    await api.actor.setSiteSettings(original.ok);
    session.revoke();
    api.revoke();
  }
});

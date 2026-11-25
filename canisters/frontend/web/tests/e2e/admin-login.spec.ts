import { expect, test } from "@playwright/test";
import { icp, signInWithLocalII, submitMessage } from "../support/local";

test("local II login: non-admin is denied, admin manages a message in the inbox", async ({ page, context }) => {
  test.setTimeout(90_000);
  const marker = `ui${Date.now()}`;
  const msgId = await submitMessage({ name: `UI Test ${marker}`, email: `${marker}@example.se`, message: "Hej från UI-testet.\nRad två." });

  await signInWithLocalII(page, context);
  await expect(page.getByRole("heading", { name: "Begär åtkomst" })).toBeVisible();
  const principal = (await page.getByTestId("principal").textContent())!.trim();
  expect(principal).not.toBe("2vxsx-fae");

  // The local controller grants access; the page picks it up after a reload.
  expect(icp("canister", "call", "site", "addAdmin", `(principal "${principal}")`)).toContain("ok");
  try {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Inkorg" })).toBeVisible();

    await page.getByLabel("Sök").fill(marker);
    const item = page.getByRole("button", { name: new RegExp(`UI Test ${marker}`) });
    await expect(item).toBeVisible();
    await item.click();
    await expect(page.getByRole("status").filter({ hasText: "Markerad som läst" })).toBeVisible();
    await expect(page.getByRole("article")).toContainText("Rad två.");

    await page.getByLabel("Intern anteckning").fill("Ringer tillbaka i morgon.");
    await page.getByRole("button", { name: "Spara anteckning" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Anteckningen sparad" })).toBeVisible();

    await page.getByRole("button", { name: "Markera som hanterad" }).click();
    await page.getByRole("button", { name: "Hanterade", exact: true }).click();
    await expect(item).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportera CSV" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^axelkod-meddelanden-\d{4}-\d{2}-\d{2}\.csv$/);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("article").getByRole("button", { name: "Radera" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Meddelandet raderat" })).toBeVisible();
    await expect(item).toHaveCount(0);

    await page.getByRole("button", { name: "Logga ut" }).click();
    await expect(page.getByRole("button", { name: "Logga in med Internet Identity" })).toBeVisible();
  } finally {
    icp("canister", "call", "site", "removeAdmin", `(principal "${principal}")`);
  }
  expect(msgId).toBeGreaterThan(0n);
});

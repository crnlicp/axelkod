import { expect, test } from "@playwright/test";

// Unique address per run: the canister allows 3 messages per address per day.
const email = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.se`;

test("client validation: errors announced, first invalid field focused", async ({ page }) => {
  await page.goto("/#kontakt");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Skicka" }).click();
  await expect(page.getByLabel("Namn")).toBeFocused();
  await expect(page.getByLabel("Namn")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Fyll i ditt namn.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Kontrollera de markerade fälten." })).toBeVisible();
  // Fixing a field clears its error.
  await page.getByLabel("Namn").fill("Anna");
  await expect(page.getByLabel("Namn")).toHaveAttribute("aria-invalid", "false");
});

test("submit (sv) stores the message and shows the thank-you text", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // typing before hydration would be lost
  await page.getByLabel("Namn").fill("E2E Testsson");
  await page.getByLabel("E-post").fill(email());
  await page.getByLabel("Telefon").fill("+46 31-123 45 67");
  await page.getByLabel("Område").selectOption("software");
  await page.getByLabel("Meddelande").fill("Hej!\nDet här är ett automatiskt test.");
  await page.getByLabel(/Jag godkänner/).check();
  await page.getByRole("button", { name: "Skicka" }).click();
  await expect(page.getByText("Tack!")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#kontakt").getByRole("status")).toContainText("Vi återkommer inom 1–2 arbetsdagar.");
  await expect(page.getByText("Tack!")).toBeFocused();
  expect(errors).toEqual([]);
});

test("submit (en) works with only required fields", async ({ page }) => {
  await page.goto("/en/");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("E2E Test");
  await page.getByLabel("Email").fill(email());
  await page.getByLabel("Area").selectOption("other");
  await page.getByLabel("Message").fill("Hello from the English form.");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thank you!")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#contact").getByRole("status")).toContainText("We get back to you within 1–2 business days.");
});

test("honeypot is hidden and skipped by keyboard", async ({ page }) => {
  await page.goto("/");
  const hp = page.locator("#cf-website");
  await expect(hp).toBeAttached();
  const box = await hp.boundingBox();
  expect(box && box.x + box.width).toBeLessThan(0); // positioned off-screen
  await expect(hp).toHaveAttribute("tabindex", "-1");
});

test("contact details and retention come from the backend", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kontaktuppgifter" })).toBeVisible();
  await expect(page.locator("aside").getByText("Mölndal")).toBeVisible();
  await page.goto("/integritet");
  await expect(page.getByText("raderas automatiskt efter 12 månader")).toBeVisible();
});

test("CSP allows the backend calls", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.headers()["content-security-policy"]).toContain("connect-src 'self' https://icp-api.io");
});

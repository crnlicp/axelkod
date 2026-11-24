// Helpers for tests against the local network (run `scripts/deploy.sh local` first).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";
import { createActor } from "../../app/bindings/backend";

export const root = new URL("../../../../", import.meta.url).pathname;

/** icp CLI as the local controller (anonymous); never used for mainnet. */
export const icp = (...args: string[]) =>
  execFileSync("icp", [...args, "--identity", "anonymous"], { cwd: root, encoding: "utf8" });

const net = JSON.parse(execFileSync("icp", ["network", "status", "--json"], { cwd: root, encoding: "utf8" }));
export const ids = JSON.parse(readFileSync(`${root}/.icp/cache/mappings/local.ids.json`, "utf8"));
export const agentOptions = { host: net.api_url as string, rootKey: Uint8Array.from(Buffer.from(net.root_key, "hex")) };
export const anonBackend = () => createActor(ids.backend, { agentOptions });

/** Submits a contact message through the public API (waits out the 3 s token minimum). */
export async function submitMessage(fields: { name: string; email: string; message: string }) {
  const { Area, Lang } = await import("../../app/bindings/backend");
  const anon = anonBackend();
  const tok = await anon.getFormToken(`seed${Date.now()}${Math.random()}`.replace(/\W/g, "").padEnd(16, "x").slice(0, 40));
  if (tok.__kind__ !== "ok") throw new Error(tok.err.__kind__);
  await new Promise((r) => setTimeout(r, 3_100));
  const res = await anon.submitContact({ ...fields, area: Area.software, lang: Lang.sv, consent: true, website: "" }, tok.ok);
  if (res.__kind__ !== "ok") throw new Error(res.err.__kind__);
  return res.ok;
}

/**
 * Signs in to the admin through the local Internet Identity. The local II runs
 * with dummy auth: creating an identity asks for a "seed index" in a browser
 * prompt instead of a passkey, so the test answers that prompt.
 */
export async function signInWithLocalII(page: Page, context: BrowserContext) {
  await page.goto("/admin");
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Logga in med Internet Identity" }).click(),
  ]);
  popup.on("dialog", (d) => void d.accept(String(1 + Math.floor(Math.random() * 1000))));
  await popup.getByRole("button", { name: "Create" }).first().click();
  await popup.getByRole("button", { name: "Create with passkey" }).click();
  await popup.getByLabel(/name/i).first().fill("E2E Admin");
  await popup.getByRole("button", { name: "Create identity" }).click();
  await popup.getByRole("button", { name: "Continue", exact: true }).click();
  await popup.waitForEvent("close");
}

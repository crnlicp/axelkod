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
  // Opt in to the local test II (the app defaults to id.ai, which needs a real passkey).
  await context.addInitScript(() => localStorage.setItem("axelkod:ii", "local"));
  await page.goto("/admin");
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Logga in med Internet Identity" }).click(),
  ]);
  // The seed picks the test credential; reusing one would try to register a
  // credential II already has, so every sign-in gets a fresh seed.
  const seed = String(Date.now() % 1_000_000_000);
  popup.on("dialog", (d) => void d.accept(seed));
  await popup.getByRole("button", { name: "Create" }).first().click();
  await popup.getByRole("button", { name: "Create with passkey" }).click();
  await popup.getByLabel(/name/i).first().fill("E2E Admin");
  await popup.getByRole("button", { name: "Create identity" }).click();
  await popup.getByRole("button", { name: "Continue", exact: true }).click();
  await popup.waitForEvent("close");
}

/**
 * Signs in through local II, has the local controller grant admin, and returns the
 * principal plus a cleanup that revokes it.
 */
export async function signInAsAdmin(page: Page, context: BrowserContext) {
  await signInWithLocalII(page, context);
  const principal = (await page.getByTestId("principal").textContent())!.trim();
  icp("canister", "call", "backend", "addAdmin", `(principal "${principal}")`);
  await page.reload();
  await page.getByRole("heading", { name: "Inkorg" }).waitFor();
  return { principal, revoke: () => icp("canister", "call", "backend", "removeAdmin", `(principal "${principal}")`) };
}

/** A node-side admin actor (throwaway in-memory key) for test setup and restore. */
export async function apiAdmin() {
  const { Ed25519KeyIdentity } = await import("@icp-sdk/core/identity");
  const identity = Ed25519KeyIdentity.generate();
  const principal = identity.getPrincipal().toText();
  icp("canister", "call", "backend", "addAdmin", `(principal "${principal}")`);
  return {
    actor: createActor(ids.backend, { agentOptions: { ...agentOptions, identity } }),
    revoke: () => icp("canister", "call", "backend", "removeAdmin", `(principal "${principal}")`),
  };
}

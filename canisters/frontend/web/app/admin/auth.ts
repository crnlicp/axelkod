// Internet Identity sign-in for the admin. Loaded only by /admin routes.
import { AuthClient } from "@icp-sdk/auth/client";
import type { Identity } from "@icp-sdk/core/agent";
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";
import { createActor, type Site } from "../bindings/site";

const II_CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai";
const env = safeGetCanisterEnv();

function isLocal(host: string) {
  return host === "localhost" || host.endsWith(".localhost");
}

// Gateway hosts serve the canister under its own ID, which is the primary origin.
function isCanisterHost(host: string) {
  return /\.(icp0\.io|ic0\.app|icp\.net)$/.test(host);
}

/**
 * Admin principals are anchored on the frontend canister's address (user-sign-in
 * skill): on a custom domain we derive against https://<frontend-id>.icp.net, which
 * lists the domain in /.well-known/ii-alternative-origins. On the canister address
 * itself nothing is needed.
 */
function derivationOrigin(): string | undefined {
  const host = location.hostname;
  const frontendId = env?.["PUBLIC_CANISTER_ID:web"];
  if (isLocal(host) || isCanisterHost(host) || !frontendId) return undefined;
  return `https://${frontendId}.icp.net`;
}

/** localStorage key that switches a local deployment to the local test II. */
export const LOCAL_II_FLAG = "axelkod:ii";

/**
 * Local deployments sign in with the real Internet Identity (id.ai, passkeys) by
 * default; the local network trusts mainnet II's signatures. The local II from
 * `ii: true` runs in test mode (it asks for a "seed index" with window.prompt,
 * which embedded browsers block), so only the e2e tests opt in to it by setting
 * localStorage[LOCAL_II_FLAG] = "local".
 */
function useLocalII(): boolean {
  if (!isLocal(location.hostname)) return false;
  try {
    return localStorage.getItem(LOCAL_II_FLAG) === "local";
  } catch {
    return false;
  }
}

let client: AuthClient | null = null;

export function authClient(): AuthClient {
  if (client) return client;
  const local = useLocalII();
  client = new AuthClient({
    ...(local
      ? { identityProvider: { authorizeUrl: `http://id.ai.localhost:${location.port || "8000"}/authorize`, canisterId: II_CANISTER } }
      : {}),
    derivationOrigin: derivationOrigin(),
    // These options are only for the client's own calls to the II canister (it
    // mints each session's delegations there). With id.ai the session lives on
    // mainnet, also when the site runs on a local network; sending those calls to
    // the local replica fails with "The session behind this identity no longer exists".
    agentOptions: local ? { rootKey: env?.IC_ROOT_KEY } : { host: "https://icp-api.io" },
  });
  return client;
}

export function adminActor(identity: Identity): Site {
  const id = env?.["PUBLIC_CANISTER_ID:site"];
  if (!id) throw new Error("ic_env cookie missing: backend canister id unknown");
  return createActor(id, { agentOptions: { identity, rootKey: env?.IC_ROOT_KEY } });
}

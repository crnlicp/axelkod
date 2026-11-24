// Internet Identity sign-in for the admin. Loaded only by /admin routes.
import { AuthClient } from "@icp-sdk/auth/client";
import type { Identity } from "@icp-sdk/core/agent";
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";
import { createActor, type Backend } from "../bindings/backend";

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
  const frontendId = env?.["PUBLIC_CANISTER_ID:frontend"];
  if (isLocal(host) || isCanisterHost(host) || !frontendId) return undefined;
  return `https://${frontendId}.icp.net`;
}

let client: AuthClient | null = null;

export function authClient(): AuthClient {
  if (client) return client;
  const local = isLocal(location.hostname);
  client = new AuthClient({
    // Local network: the II that `ii: true` serves; mainnet: the default (id.ai).
    ...(local
      ? { identityProvider: { authorizeUrl: `http://id.ai.localhost:${location.port || "8000"}/authorize`, canisterId: II_CANISTER } }
      : {}),
    derivationOrigin: derivationOrigin(),
    agentOptions: { rootKey: env?.IC_ROOT_KEY },
  });
  return client;
}

export function adminActor(identity: Identity): Backend {
  const id = env?.["PUBLIC_CANISTER_ID:backend"];
  if (!id) throw new Error("ic_env cookie missing: backend canister id unknown");
  return createActor(id, { agentOptions: { identity, rootKey: env?.IC_ROOT_KEY } });
}

// Anonymous backend actor for public pages. Imported dynamically so the agent is
// never part of the first page load.
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";
import { createActor, type Backend } from "../bindings/backend";

let actor: Backend | null = null;

export function backend(): Backend {
  if (actor) return actor;
  const env = safeGetCanisterEnv();
  const id = env?.["PUBLIC_CANISTER_ID:backend"];
  if (!id) throw new Error("ic_env cookie missing: backend canister id unknown");
  // No host: the agent picks the page origin locally and icp-api.io on custom domains.
  actor = createActor(id, { agentOptions: { rootKey: env?.IC_ROOT_KEY } });
  return actor;
}

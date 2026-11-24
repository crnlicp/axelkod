// Runs at `icp deploy` sync time (after the canisters exist), with ICP_CLI_NETWORK
// and canister IDs in the environment. Phase 5c adds the SEO bake here.
//
// Local networks: the agent talks to the gateway at http://localhost:<port>, so the
// CSP's connect-src gets that origin. Mainnet keeps the production policy.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const headersFile = resolve(dirname(fileURLToPath(import.meta.url)), "../build/client/_headers");
const network = process.env.ICP_CLI_NETWORK ?? "";
const PROD = "connect-src 'self' https://icp-api.io";

const headers = readFileSync(headersFile, "utf8");
if (!headers.includes(PROD)) throw new Error(`presync: "${PROD}" not found in _headers`);
if (network !== "ic") {
  writeFileSync(headersFile, headers.replaceAll(PROD, `${PROD} http://localhost:*`));
  console.log(`presync: network "${network}", CSP allows http://localhost:*`);
}

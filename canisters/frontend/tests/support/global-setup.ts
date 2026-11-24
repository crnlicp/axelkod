// Local runs submit many contact messages; reset the canister's global rate-limit
// window first (controller-only method, called as the local controller).
import { icp } from "./local";

export default function globalSetup() {
  const out = icp("canister", "call", "backend", "resetFormLimits", "()");
  if (!out.includes("ok")) throw new Error(`resetFormLimits failed: ${out}`);
}

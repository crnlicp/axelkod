// Per-session vetKey cache, separate from crypto.ts so sign-out can clear it without
// loading the vetKeys library into the admin shell.
import type { DerivedKeyMaterial } from "@icp-sdk/vetkeys";

export const keys = new Map<string, Promise<DerivedKeyMaterial>>();

/** Drops cached keys (sign-out). */
export const forgetKeys = () => keys.clear();

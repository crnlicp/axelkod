import type { Config } from "@react-router/dev/config";

// Static export: the certified-assets canister serves prerendered HTML only.
export default {
  ssr: false,
  prerender: ["/"],
} satisfies Config;

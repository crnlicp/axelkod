import type { Config } from "@react-router/dev/config";

// Static export: the certified-assets canister serves prerendered HTML only.
// scripts/postbuild.mjs turns <page>/index.html into clean-URL files and writes _headers.
export default {
  ssr: false,
  // /nyheter/__template is copied per article (scripts/presync.mjs, Publish).
  prerender: ["/", "/en", "/integritet", "/en/privacy", "/404", "/nyheter", "/en/news", "/nyheter/__template", "/en/news/__template"],
} satisfies Config;

import { icpBindgen } from "@icp-sdk/bindgen/plugins/vite";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Generated from the committed .did; output in app/bindings/ is not committed.
    icpBindgen({ didFile: "../../backend/site/src/site.did", outDir: "./app/bindings" }),
    icpBindgen({ didFile: "../../backend/accounting/src/accounting.did", outDir: "./app/bindings" }),
    icpBindgen({ didFile: "../../backend/vault/src/vault.did", outDir: "./app/bindings" }),
    tailwindcss(),
    reactRouter(),
  ],
});

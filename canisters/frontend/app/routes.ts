import { type RouteConfig, index, route } from "@react-router/dev/routes";

// One module per page, mounted once per language. The language comes from the URL.
export default [
  index("routes/home.tsx", { id: "home-sv" }),
  route("en", "routes/home.tsx", { id: "home-en" }),
  route("integritet", "routes/privacy.tsx", { id: "privacy-sv" }),
  route("en/privacy", "routes/privacy.tsx", { id: "privacy-en" }),
  // Admin: client-rendered from admin.html (the SPA fallback), never prerendered.
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/inbox.tsx"),
    route("contact", "routes/admin/contact.tsx"),
  ]),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;

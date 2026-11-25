import { type RouteConfig, index, route } from "@react-router/dev/routes";

// One module per page, mounted once per language. The language comes from the URL.
export default [
  index("routes/home.tsx", { id: "home-sv" }),
  route("en", "routes/home.tsx", { id: "home-en" }),
  route("integritet", "routes/privacy.tsx", { id: "privacy-sv" }),
  route("en/privacy", "routes/privacy.tsx", { id: "privacy-en" }),
  route("nyheter", "routes/news.tsx", { id: "news-sv" }),
  route("en/news", "routes/news.tsx", { id: "news-en" }),
  route("nyheter/:slug", "routes/article.tsx", { id: "article-sv" }),
  route("en/news/:slug", "routes/article.tsx", { id: "article-en" }),
  // Admin: client-rendered from admin.html (the SPA fallback), never prerendered.
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/inbox.tsx"),
    route("home", "routes/admin/home.tsx"),
    route("contact", "routes/admin/contact.tsx"),
    route("seo", "routes/admin/seo.tsx"),
    route("settings", "routes/admin/settings.tsx"),
    route("news", "routes/admin/news-list.tsx"),
    route("news/:id", "routes/admin/news-edit.tsx"),
    // Ekonomi (accounting workspace).
    route("accounting", "routes/admin/accounting/layout.tsx", [
      index("routes/admin/accounting/overview.tsx"),
      route("setup", "routes/admin/accounting/setup.tsx"),
      route("sales", "routes/admin/accounting/sales/list.tsx", { id: "acc-sales" }),
      route("sales/invoices", "routes/admin/accounting/sales/list.tsx", { id: "acc-invoices" }),
      route("sales/quotes", "routes/admin/accounting/sales/list.tsx", { id: "acc-quotes" }),
      route("sales/new", "routes/admin/accounting/sales/edit.tsx"),
      route("sales/docs/:id", "routes/admin/accounting/sales/doc.tsx"),
      route("sales/payments", "routes/admin/accounting/sales/payments.tsx"),
      route("sales/reminders", "routes/admin/accounting/sales/reminders.tsx"),
      route("sales/customers", "routes/admin/accounting/sales/parties.tsx", { id: "acc-customers" }),
      route("sales/items", "routes/admin/accounting/sales/parties.tsx", { id: "acc-items" }),
      route("ledger", "routes/admin/accounting/ledger/list.tsx"),
      route("ledger/drafts", "routes/admin/accounting/ledger/drafts.tsx"),
      route("ledger/new", "routes/admin/accounting/ledger/edit.tsx"),
      route("ledger/journal", "routes/admin/accounting/ledger/journal.tsx"),
      route("ledger/general", "routes/admin/accounting/ledger/general.tsx", { id: "acc-general" }),
      route("ledger/accounts/:number", "routes/admin/accounting/ledger/general.tsx", { id: "acc-account" }),
      route("ledger/trial-balance", "routes/admin/accounting/ledger/trial-balance.tsx"),
      route("ledger/:id", "routes/admin/accounting/ledger/voucher.tsx"),
      route("settings/:tab?", "routes/admin/accounting/settings.tsx"),
    ]),
  ]),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;

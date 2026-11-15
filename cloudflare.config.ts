// Read by Cloudflare's cf CLI. No account-specific resources are required for the local-first app.
export default {
  worker: {
    name: "musicbracket",
    compatibilityDate: "2026-11-15",
    assets: { notFoundHandling: "single-page-application" },
  },
};

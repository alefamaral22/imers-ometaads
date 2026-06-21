import type { NextConfig } from 'next';

// Security headers that are static (do not need a per-request nonce) live here so they apply
// even on responses that bypass middleware (e.g. static assets). The CSP with a per-request
// nonce is set in middleware.ts — Next merges both. See docs/security/threats/web-dashboard.md.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The dashboard never reads tables from the browser; all data is fetched server-side.
  experimental: {
    // Keep server-only secrets out of the client bundle by failing the build if imported.
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default nextConfig;

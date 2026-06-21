import type { NextConfig } from 'next';

// Static export: every published landing page is a fully static site deployed to Cloudflare
// Pages (<subdomain>.example.com). No server runtime — content comes from the build-time
// `generated/` artifacts. SPEC-000 §8 Onda 8 / ADR 0012.
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  // Pages serves static files; Next's image optimizer needs a server, so disable it.
  images: { unoptimized: true },
  // Drafts are noindex via <meta>; trailing slash keeps Pages routing predictable.
  trailingSlash: true,
};

export default nextConfig;

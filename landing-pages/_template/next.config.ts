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
  // Runner build speed (shared-cpu-1x): the content is already validated by the serializer
  // (parseContentDoc) and the template is type-checked in CI, so re-linting/type-checking during the
  // headless build is wasted time. The template's own `typecheck` script still guards it in CI.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // A static export has no serverless functions, so the "Collecting build traces" step is pure waste
  // here. We can't disable it via config in Next 15, but we limit its scope to the template dir so it
  // stops walking the whole monorepo's node_modules — the single biggest cost on the small VM.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;

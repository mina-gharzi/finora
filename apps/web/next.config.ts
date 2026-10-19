import type { NextConfig } from "next";

/**
 * Baseline security headers for every response.
 *
 * - `nosniff` stops a browser from re-interpreting a response as a different
 *   MIME type (also set explicitly on the CSV export).
 * - `X-Frame-Options: DENY` prevents clickjacking of the authenticated UI.
 * - `Referrer-Policy` only leaks the origin (not the full URL) cross-site, so
 *   account ids never travel in referrers.
 * - `Permissions-Policy` disables powerful features this app never uses.
 * - HSTS is only emitted by a production build; browsers ignore it over plain
 *   HTTP, so local development and end-to-end tests over http://127.0.0.1 are
 *   unaffected. `includeSubDomains`/`preload` are deliberately omitted because
 *   the deployment's subdomain topology is not verifiable from this repo.
 *
 * A Content-Security-Policy is intentionally not set here: Next.js emits
 * inline bootstrap scripts, and a strict CSP must be validated against the
 * final deployed origin before it can be enforced without breaking the app.
 */
const isProductionBuild = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(isProductionBuild
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@finora/shared"],
  turbopack: {
  rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

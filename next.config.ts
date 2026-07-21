import type { NextConfig } from "next";

const securityHeaders = [
  // keep the whole app out of search indexes / caches
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
  // hardening
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // the /init first-run fallback applies SQL migrations at runtime —
  // make sure the drizzle folder ships with the serverless function
  outputFileTracingIncludes: {
    "/init": ["./drizzle/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

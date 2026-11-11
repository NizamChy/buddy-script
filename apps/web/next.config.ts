import type { NextConfig } from "next";

// Where the Express API lives. The browser never talks to it directly: /api/* is proxied
// through this app, so auth cookies are first-party (no third-party-cookie / CORS issues).
const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // CDN image transformer: next/image requests go through Vercel Image Optimization, which
  // resizes per device width, serves AVIF/WebP and caches the result at the edge.
  images: {
    formats: ["image/avif", "image/webp"],
    // A few well-spread widths keep the number of cached variants (and cost) small.
    deviceSizes: [640, 828, 1080, 1280],
    imageSizes: [32, 48, 64, 96, 128],
    qualities: [75],
    // Uploaded files have unique, immutable names, so variants can be cached for a year.
    minimumCacheTTL: 31536000,
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
    localPatterns: [{ pathname: "/images/**" }],
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/uploads/:path*", destination: `${API_URL}/uploads/:path*` },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

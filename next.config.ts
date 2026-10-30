import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const scriptSrc = isDev
  ? "'self' 'unsafe-eval' 'unsafe-inline'"
  : "'self' 'unsafe-inline'";

function getSupabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const supabaseHost = getSupabaseHost();
const prodSupabaseConnect = supabaseHost
  ? `https://${supabaseHost} wss://${supabaseHost}`
  : "https://*.supabase.co wss://*.supabase.co";
const prodSupabaseImg = supabaseHost ? `https://${supabaseHost}` : "https://*.supabase.co";

const connectSrc = isDev
  ? `'self' ${prodSupabaseConnect} https://*.supabase.in wss://*.supabase.in http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:* ws: wss:`
  : `'self' ${prodSupabaseConnect}`;

const imgSrc = isDev
  ? `'self' blob: data: ${prodSupabaseImg} https://*.supabase.in http://127.0.0.1:* http://localhost:*`
  : `'self' blob: data: ${prodSupabaseImg}`;

const upgradeInsecureRequests = isDev ? "" : "upgrade-insecure-requests;";

const cspHeader = `
    default-src 'self';
    script-src ${scriptSrc};
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src ${imgSrc};
    font-src 'self' https://fonts.gstatic.com data:;
    connect-src ${connectSrc};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${upgradeInsecureRequests}
`
  .replace(/\s{2,}/g, ' ')
  .trim();

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: supabaseHost
      ? [
          {
            protocol: 'https',
            hostname: supabaseHost,
          },
          {
            protocol: 'https',
            hostname: '**.supabase.co',
          },
          {
            protocol: 'http',
            hostname: '127.0.0.1',
          },
          {
            protocol: 'http',
            hostname: 'localhost',
          },
        ]
      : [
          {
            protocol: 'https',
            hostname: '**.supabase.co',
          },
          {
            protocol: 'https',
            hostname: '**.supabase.in',
          },
          {
            protocol: 'http',
            hostname: '127.0.0.1',
          },
          {
            protocol: 'http',
            hostname: 'localhost',
          },
        ],
  },
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
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
        ],
      },
      {
        source: '/read/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, must-revalidate',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

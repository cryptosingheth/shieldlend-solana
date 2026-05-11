/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: new URL("..", import.meta.url).pathname,

  async headers() {
    // Next.js dev mode uses React Refresh which requires eval() for Hot Module
    // Replacement. Production CSP blocks eval() entirely. Keep prod strict;
    // relax in dev so the dev server can hydrate the page and bind event handlers.
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = isDev
      ? "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' 'unsafe-inline'"
      : "script-src 'self' 'wasm-unsafe-eval'";

    return [
      {
        source: "/(.*)",
        headers: [
          {
            // 'wasm-unsafe-eval' is required for snarkjs/circomlibjs WebAssembly instantiation.
            // 'unsafe-eval' is required ONLY in dev for Next.js Fast Refresh / HMR.
            // Production restricts script execution to same-origin only.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              "img-src 'self' data:",
              "connect-src 'self' https: wss:",
              "worker-src blob:",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "off",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

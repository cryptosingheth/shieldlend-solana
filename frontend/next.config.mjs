/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: new URL("..", import.meta.url).pathname,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // 'wasm-unsafe-eval' is required for snarkjs/circomlibjs WebAssembly instantiation.
            // All other script execution is restricted to same-origin only.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'wasm-unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self'",
              "img-src 'self' data:",
              "connect-src 'self' https:",
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

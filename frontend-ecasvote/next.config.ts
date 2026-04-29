import type { NextConfig } from "next";

const gatewayTarget =
  process.env.GATEWAY_PROXY_URL?.trim() || "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "4000",
        pathname: "/uploads/**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/ecasvote-gateway/:path*",
        destination: `${gatewayTarget.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const gatewayTarget =
  process.env.GATEWAY_PROXY_URL?.trim() || "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
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

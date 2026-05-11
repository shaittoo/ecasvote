import type { NextConfig } from "next";

const gatewayTarget =
  process.env.GATEWAY_PROXY_URL?.trim() || "http://127.0.0.1:4000";

type RemotePattern = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>[number];

/**
 * Allows next/image to optimize candidate photos served from the gateway.
 * - Dev: localhost:4000/uploads/...
 * - Prod behind Nginx: set NEXT_PUBLIC_IMAGE_REMOTE_HOSTS to your HTTPS hostname(s).
 *   Example: NEXT_PUBLIC_IMAGE_REMOTE_HOSTS=192.168.1.6,vote.school.edu|https
 *   Paths cover direct gateway URLs and same-origin /ecasvote-gateway/uploads/...
 */
function buildImageRemotePatterns(): RemotePattern[] {
  const patterns: RemotePattern[] = [
    {
      protocol: "http",
      hostname: "localhost",
      port: "4000",
      pathname: "/uploads/**",
    },
    {
      protocol: "http",
      hostname: "127.0.0.1",
      port: "4000",
      pathname: "/uploads/**",
    },
  ];

  const raw = process.env.NEXT_PUBLIC_IMAGE_REMOTE_HOSTS?.trim();
  if (!raw) return patterns;

  for (const token of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    let hostname = token;
    let useHttps = true;
    if (token.includes("|")) {
      const parts = token.split("|").map((x) => x.trim());
      hostname = parts[0] ?? token;
      const scheme = parts[1]?.toLowerCase();
      if (scheme === "http") useHttps = false;
      if (scheme === "https") useHttps = true;
    }

    const pathnames = ["/uploads/**", "/ecasvote-gateway/uploads/**"] as const;
    for (const pathname of pathnames) {
      if (useHttps) {
        patterns.push({ protocol: "https", hostname, pathname });
      }
      patterns.push({ protocol: "http", hostname, pathname });
    }
  }

  return patterns;
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: buildImageRemotePatterns(),
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

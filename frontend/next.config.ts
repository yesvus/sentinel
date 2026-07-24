import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${API_ORIGIN}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;

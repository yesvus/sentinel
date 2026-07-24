import type { NextConfig } from "next";

// Reliable, always-on serverless API (no cold starts). The site must work even if REALTIME_ORIGIN is down.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";
// Optional real-time layer (Socket.IO needs a persistent process, which serverless can't provide).
// Free-tier hosts like Render sleep when idle, that's fine, the app degrades gracefully without it.
const REALTIME_ORIGIN = process.env.REALTIME_ORIGIN ?? API_ORIGIN;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${REALTIME_ORIGIN}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;

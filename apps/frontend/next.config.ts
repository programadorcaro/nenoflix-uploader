import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Allow external access for cloudflared
  experimental: {
    serverActions: {
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || ["localhost:8097"],
    },
  },
};

export default nextConfig;

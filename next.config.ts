import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Keep pdf-parse as a native Node CJS module — do NOT bundle it with webpack
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;

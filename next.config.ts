import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Keep unpdf as a native Node ESM module — do NOT bundle it with webpack
  serverExternalPackages: ['unpdf'],
};

export default nextConfig;

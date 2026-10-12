import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Only set by scripts/dev-preview.mjs, which runs a second dev server beside the main one.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;

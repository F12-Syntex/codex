import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // The dev badge sits on top of the sidebar's Settings row.
  devIndicators: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

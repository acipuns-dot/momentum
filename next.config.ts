import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.exercisedb.io',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'v2.exercisedb.io',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;

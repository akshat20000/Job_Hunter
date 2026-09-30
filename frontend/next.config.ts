import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  },
  experimental:{
    cpus:1,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;

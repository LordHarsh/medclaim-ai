import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@neondatabase/serverless"],
  typescript: {
    // Type checking is run separately via `tsc --noEmit`
    // The Next.js build TS checker has a stack overflow with @neondatabase/auth recursive types
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

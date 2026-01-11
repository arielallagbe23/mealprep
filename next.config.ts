// next.config.ts
import type { NextConfig } from "next";

type NextConfigWithEslint = NextConfig & {
  eslint?: {
    ignoreDuringBuilds?: boolean;
  };
};

const nextConfig: NextConfigWithEslint = {
  eslint: {
    // Laisse passer les erreurs ESLint pendant le build (déploiement)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

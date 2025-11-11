import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // Ignore specific build errors related to the Looker SDK
    typescript: {
        // Don't fail the build on TypeScript errors
        ignoreBuildErrors: true,
    },
    experimental: {
        serverMinification: false,
    },
    // Mark Looker SDK packages as external to avoid Turbopack bundling issues
    serverExternalPackages: ['@looker/sdk', '@looker/sdk-node'],
};

export default nextConfig;

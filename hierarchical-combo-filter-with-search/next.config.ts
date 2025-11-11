import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
    // Ignore specific build errors related to the Looker SDK
    typescript: {
        // Don't fail the build on TypeScript errors
        ignoreBuildErrors: true,
    },
    assetPrefix: isProd
        ? 'https://www.lkr.dev/examples/hierarchical-combo-filter-with-search'
        : undefined,
    experimental: {
        serverMinification: false,
    },
    // Mark Looker SDK packages as external to avoid Turbopack bundling issues
    serverExternalPackages: ['@looker/sdk', '@looker/sdk-node'],
};

export default nextConfig;

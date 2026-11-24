import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@clickhouse/client", "ssh2", "maxmind", "fzstd"],
  outputFileTracingExcludes: {
    "*": ["./data/**/*", "data/**/*"],
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

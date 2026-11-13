import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static output so the app can be hosted on plain HTTPS storage (iPhone PWA install).
  output: "export",
  // Directory URLs (`/players/`) resolve on plain static hosts without server rewrites.
  trailingSlash: true,
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

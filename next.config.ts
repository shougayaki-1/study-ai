import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/nightly-prompt": ["./analysis/nightly.md"],
  },
};

export default nextConfig;

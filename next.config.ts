import type { NextConfig } from "next";

if (!process.env.CI) {
  require("./src/lib/env");
}

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;

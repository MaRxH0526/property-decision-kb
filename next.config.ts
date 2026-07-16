import type { NextConfig } from "next";

const isOssBuild = process.env.OSS_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isOssBuild
    ? {
        output: "export",
        typescript: {
          tsconfigPath: "tsconfig.oss.json",
        },
      }
    : {}),
};

export default nextConfig;

import type { NextConfig } from "next";

const isOssBuild = process.env.OSS_STATIC_EXPORT === "1";
const isGitHubPagesBuild = process.env.GITHUB_PAGES === "1";
const githubBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const isStaticBuild = isOssBuild || isGitHubPagesBuild;

const nextConfig: NextConfig = {
  ...(isStaticBuild
    ? {
        output: "export",
        typescript: {
          tsconfigPath: "tsconfig.oss.json",
        },
      }
    : {}),
  ...(isGitHubPagesBuild
    ? {
        basePath: githubBasePath,
        assetPrefix: githubBasePath,
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;

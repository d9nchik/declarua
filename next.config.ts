import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.PAGES === "true" ? "/declarua" : "",
};

export default nextConfig;

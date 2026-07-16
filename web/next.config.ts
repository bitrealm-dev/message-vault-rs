import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  async redirects() {
    return [
      { source: "/group-chats", destination: "/all", permanent: false },
      { source: "/unassigned", destination: "/all", permanent: false },
    ];
  },
};

export default nextConfig;

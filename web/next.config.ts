import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  async redirects() {
    return [
      { source: "/group-chats", destination: "/group-messages", permanent: false },
      { source: "/group-chats-2", destination: "/group-messages", permanent: false },
      { source: "/unassigned", destination: "/all", permanent: false },
    ];
  },
};

export default nextConfig;

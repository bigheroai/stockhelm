import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships a WASM binary and postgres.js opens raw sockets; keep both
  // out of the bundler and load them from node_modules at runtime.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  poweredByHeader: false,

  // Type checking runs as its own step (`pnpm typecheck`) so the build does not
  // repeat it — and so the build works in sandboxes that forbid child processes.
  typescript: { ignoreBuildErrors: true },

  // Single-process build: keeps memory flat on small VPS instances and avoids
  // forking a worker per page during "Collecting page data".
  experimental: { cpus: 1 },
};

export default nextConfig;

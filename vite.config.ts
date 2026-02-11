import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 3000,
    allowedHosts: ["nearest-area-said-clocks.trycloudflare.com"],
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          // Server-only code (TanStack SSR, postgres) leaks into client barrel exports
          external: [/^node:/, "os", "fs", "net", "tls", "crypto", "stream", "perf_hooks"],
        },
      },
    },
  },
  plugins: [tailwindcss(), tsconfigPaths(), tanstackStart(), react()],
});

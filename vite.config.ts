import fs from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const publicUrl = process.env.PUBLIC_URL || "https://dev.donguri.app";
const publicHost = new URL(publicUrl).hostname;

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "react-dom/server"],
  },
  optimizeDeps: {
    include: ["react-markdown"],
  },
  define: {
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  server: {
    port: 3000,
    allowedHosts: [publicHost],
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
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart(),
    react(),
    {
      name: "sw-cache-version",
      apply: "build",
      closeBundle: async () => {
        const out = path.resolve("dist/client", "sw.js");
        try {
          await fs.access(out);
        } catch {
          // sw.js not copied yet, skip
          return;
        }
        const buildId = Date.now().toString(36);
        let src = await fs.readFile(out, "utf8");
        src = src.replace(/__SW_VERSION__/g, buildId);
        await fs.writeFile(out, src);
      },
    },
  ],
});

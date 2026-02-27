import crypto from "node:crypto";
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
    tanstackStart({
      serverFns: {
        generateFunctionId: ({ filename, functionName }) => {
          if (process.env.NODE_ENV === "development") {
            const short = filename
              .replace(/^.*\/app\//, "")
              .replace(/\.(ts|tsx)$/, "")
              .replaceAll("/", ".");
            const hash = crypto
              .createHash("sha1")
              .update(`${filename}--${functionName}`)
              .digest("hex")
              .slice(0, 8);
            return `${short}--${functionName}_${hash}`;
          }
          return undefined;
        },
      },
    }),
    react(),
  ],
});

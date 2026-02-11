import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeRequest, sendNodeResponse } from "srvx/node";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const clientDir = resolve(__dirname, "../dist/client");

const handler = (await import("../dist/server/server.js")).default;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

async function serveStatic(pathname) {
  const filePath = join(clientDir, pathname);

  // Path traversal prevention
  if (!filePath.startsWith(clientDir)) return null;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return null;

    const body = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const headers = {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
    };

    // Content-hashed assets get immutable cache headers
    if (pathname.startsWith("/assets/")) {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }

    return new Response(body, { status: 200, headers });
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // Try static files first
  const staticResponse = await serveStatic(url.pathname);
  if (staticResponse) {
    return sendNodeResponse(res, staticResponse);
  }

  // Delegate to TanStack Start fetch handler
  const webReq = new NodeRequest({ req, res });
  const webRes = await handler.fetch(webReq);
  return sendNodeResponse(res, webRes);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${port}`);
});

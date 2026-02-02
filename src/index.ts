import openapi, { fromTypes } from "@elysiajs/openapi";
import staticPlugin from "@elysiajs/static";
import { Elysia } from "elysia";
import { mediaRoutes } from "./routes/media";

const app = new Elysia()
  .use(
    openapi({
      references: fromTypes()
    })
  )
  .use(await staticPlugin({ prefix: '/', noExtensionLookup: true }))
  .use(mediaRoutes)
  .get('/*', ({ path }) => {
    // Don't serve index.html for API routes or static files
    if (path.startsWith('/api/')) {
      return new Response('Not Found', { status: 404 });
    }
    return Bun.file('public/index.html');
  })
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

export type App = typeof app

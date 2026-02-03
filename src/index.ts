import openapi, { fromTypes } from "@elysiajs/openapi";
import staticPlugin from "@elysiajs/static";
import { Elysia } from "elysia";
import { mediaRoutes } from "./routes/media";
import index from "../public/index.html";

const app = new Elysia({
  serve: {
    routes: {
      "/api/*": false,
    },
  },
})
  // Manual CORS headers (avoids Vary: * from @elysiajs/cors which breaks caching)
  .onRequest(({ set }) => {
    set.headers['Access-Control-Allow-Origin'] = '*'
    set.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    set.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    set.headers['Access-Control-Expose-Headers'] = 'Cache-Control'
  })
  .options('/*', ({ set }) => {
    set.status = 204
    return ''
  })
  .use(
    openapi({
      references: fromTypes()
    })
  )
  .use(mediaRoutes)
  .get("/", index)
  .use(await staticPlugin({ prefix: '/', alwaysStatic: true }))
  .listen({
    port: process.env.PORT || 3000,
    hostname: '0.0.0.0'
  });

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

export type App = typeof app

import openapi, { fromTypes } from "@elysiajs/openapi";
import staticPlugin from "@elysiajs/static";
import { Elysia } from "elysia";
import { mediaRoutes } from "./routes/media";
import cors from "@elysiajs/cors";
import logixlysia from "logixlysia";

const app = new Elysia()
  .use(logixlysia())
  .use(cors())
  .use(
    openapi({
      references: fromTypes()
    })
  )
  .use(await staticPlugin({
    prefix: '/',
    alwaysStatic: true,
    indexHTML: true
  }))
  .group("/api", group =>
    group
      .use(mediaRoutes)
  )
  // .get('/*', async ({ server, set }) => {
  //   const res = await fetch(server!.url!)
  //   set.headers['Content-Type'] = 'text/html'
  //   return await res.text()
  // })
  .listen({
    port: process.env.PORT || 3000,
    hostname: '0.0.0.0'
  });

export type App = typeof app

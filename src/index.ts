import openapi, { fromTypes } from "@elysiajs/openapi";
import staticPlugin from "@elysiajs/static";
import { Elysia } from "elysia";
import { mediaRoutes } from "./routes/media";
import cors from "@elysiajs/cors";

const app = new Elysia()
  .use(cors())
  .use(
    openapi({
      references: fromTypes()
    })
  )
  .use(await staticPlugin({ prefix: '/' }))
  .use(mediaRoutes)
  .listen({
    port: process.env.PORT || 3000,
    hostname: '0.0.0.0'
  });

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

export type App = typeof app

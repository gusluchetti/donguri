import cors from "@elysiajs/cors";
import openapi, { fromTypes } from "@elysiajs/openapi";
import staticPlugin from "@elysiajs/static";
import { Elysia } from "elysia";
import { mediaRoutes } from "./routes/media";
import index from "../public/index.html";

const app = new Elysia({
  serve: {
    routes: {
      "/api/*": false, // Prevent static hijacking of API routes
    },
  },
})
  .use(cors())
  .use(
    openapi({
      references: fromTypes()
    })
  )
  .use(mediaRoutes)
  .use(await staticPlugin({ prefix: '/', alwaysStatic: true }))
  .get("/*", index)
  .listen({
    port: process.env.PORT || 3000,
    hostname: '0.0.0.0'
  });

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

export type App = typeof app

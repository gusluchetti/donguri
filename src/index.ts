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
  .use(await staticPlugin({ prefix: '/' }))
  .use(mediaRoutes)
  .get('/hi', { message: 'hi' } as const)
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

export type App = typeof app

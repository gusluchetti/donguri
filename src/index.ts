import openapi, { fromTypes } from "@elysiajs/openapi";
import staticPlugin from "@elysiajs/static";
import { Elysia } from "elysia";

const app = new Elysia()
  .use(
    openapi({
      references: fromTypes()
    })
  )
  .use(await staticPlugin({ prefix: '/' }))
  .get("/", () => "Hello Elysia")
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

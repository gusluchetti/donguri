import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routerWithQueryClient } from "@tanstack/react-router-with-query";
import { DefaultPendingComponent } from "~/components/DefaultPendingComponent";
import { createQueryClient } from "~/lib/query";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = createQueryClient();

  const router = routerWithQueryClient(
    createTanStackRouter({
      routeTree,
      scrollRestoration: true,
      defaultPreload: "intent",
      defaultStaleTime: 30_000,
      defaultPreloadStaleTime: 30_000,
      defaultViewTransition: true,
      defaultPendingMs: 200,
      defaultPendingMinMs: 300,
      defaultPendingComponent: DefaultPendingComponent,
      context: { queryClient },
    }),
    queryClient,
  );

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

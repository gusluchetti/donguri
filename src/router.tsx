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
      defaultViewTransition: {
        types: ({ fromLocation, toLocation }) => {
          if (!fromLocation) return ["forward"];
          const fromIdx = fromLocation.state.__TSR_index ?? 0;
          const toIdx = toLocation.state.__TSR_index ?? 0;
          if (fromIdx === toIdx) return false;
          return fromIdx > toIdx ? ["back"] : ["forward"];
        },
      },
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

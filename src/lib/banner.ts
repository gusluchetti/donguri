import { createServerFn } from "@tanstack/react-start";

export const getBannerCookie = createServerFn({ method: "GET" }).handler(async () => {
  const { getCookie } = await import("@tanstack/react-start/server");
  return getCookie("dg-banner-dismissed") === "1";
});

import { queryOptions } from "@tanstack/react-query";
import { getAuthState } from "~/features/auth/auth.functions";
import { getThemeCookie } from "~/lib/theme";

export function authOptions() {
  return queryOptions({
    queryKey: ["auth"],
    queryFn: () => getAuthState(),
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
    refetchOnWindowFocus: true,
  });
}

export function themeOptions() {
  return queryOptions({
    queryKey: ["theme"],
    queryFn: () => getThemeCookie(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

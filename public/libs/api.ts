import { treaty } from "@elysiajs/eden";
import { App } from "../../src";

export const api = treaty<App>('localhost:3000')

type ApiResponse<T> = Awaited<ReturnType<T>>['data']

export type MediaListResponse = ApiResponse<typeof api.api.media.get>
export type MediaItem = NonNullable<MediaListResponse>['data'][number]

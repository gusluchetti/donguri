import type { QueryClient } from "@tanstack/react-query";

/**
 * Cross-tab query invalidation via BroadcastChannel.
 *
 * When one tab mutates user data (save/remove catalog entry, quick-add),
 * it broadcasts an invalidation message so other tabs refetch instead of
 * showing stale cached data.
 */

const CHANNEL_NAME = "dg-query-sync";

type SyncMessage = { type: "invalidate"; queryKey: string[] };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/** Broadcast a query invalidation to other tabs. */
export function broadcastInvalidation(queryKey: string[] = ["user"]) {
  const ch = getChannel();
  if (!ch) return;
  const msg: SyncMessage = { type: "invalidate", queryKey };
  ch.postMessage(msg);
}

/** Listen for invalidation messages from other tabs and apply them. */
export function setupTabSync(queryClient: QueryClient) {
  const ch = getChannel();
  if (!ch) return;

  ch.onmessage = (event: MessageEvent<SyncMessage>) => {
    const { data } = event;
    if (data?.type === "invalidate" && Array.isArray(data.queryKey)) {
      queryClient.invalidateQueries({ queryKey: data.queryKey });
    }
  };
}

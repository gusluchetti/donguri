import type { Icon as IconType, IconWeight } from "@phosphor-icons/react";
import { Check, CircleDashed, Pause, Play, Star, X } from "@phosphor-icons/react";
import type { StatusValue } from "~/features/media/media-types";

const STATUS_ICON_MAP: Record<StatusValue, { Icon: IconType; weight: IconWeight }> = {
  planned: { Icon: CircleDashed, weight: "bold" },
  in_progress: { Icon: Play, weight: "fill" },
  on_hold: { Icon: Pause, weight: "fill" },
  completed: { Icon: Check, weight: "bold" },
  mastered: { Icon: Star, weight: "fill" },
  dropped: { Icon: X, weight: "bold" },
};

export function StatusIcon({ status, size = 10 }: { status: StatusValue; size?: number }) {
  const entry = STATUS_ICON_MAP[status];
  if (!entry) return null;
  const { Icon, weight } = entry;
  return <Icon size={size} weight={weight} className="shrink-0" />;
}

import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import { isInputFocused } from "~/lib/hotkeys/shortcuts";

export function useCatalogCursor({
  itemCount,
  virtualizer,
  fetchNextPage,
  hasNextPage,
  enabled = true,
}: {
  itemCount: number;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  enabled?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Reset when item count drops (new search/filter)
  const prevCount = useRef(itemCount);
  useEffect(() => {
    if (itemCount < prevCount.current) setSelectedIndex(-1);
    prevCount.current = itemCount;
  }, [itemCount]);

  // Scroll to selected index
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < itemCount) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedIndex, itemCount, virtualizer]);

  // Trigger load more when cursor nears end
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex >= itemCount - 5 && hasNextPage) {
      fetchNextPage();
    }
  }, [selectedIndex, itemCount, hasNextPage, fetchNextPage]);

  // j / ArrowDown — move down
  const moveDown = () => {
    setSelectedIndex((prev) => Math.min(prev + 1, itemCount - 1));
  };
  useHotkey("J", moveDown, { enabled: enabled && itemCount > 0 });
  useHotkey("ArrowDown", moveDown, { enabled: enabled && itemCount > 0 });

  // k / ArrowUp — move up
  const moveUp = () => {
    setSelectedIndex((prev) => (prev <= 0 ? prev : prev - 1));
  };
  useHotkey("K", moveUp, { enabled: enabled && itemCount > 0 });
  useHotkey("ArrowUp", moveUp, { enabled: enabled && itemCount > 0 });

  // G (shift+g) — jump to last loaded item
  useHotkey(
    "Shift+G",
    () => {
      if (itemCount > 0) setSelectedIndex(itemCount - 1);
    },
    { enabled },
  );

  // gg — jump to first item (sequence, needs manual input guard)
  useHotkeySequence(
    ["G", "G"],
    () => {
      if (isInputFocused()) return;
      if (itemCount > 0) setSelectedIndex(0);
    },
    { enabled },
  );

  return { selectedIndex, setSelectedIndex };
}

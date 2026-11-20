import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

/**
 * The one selected row of a titled overlay's list, as a Command list has its
 * item: the first when it opens, moved by the keys, and by the pointer moving
 * over a row, as cmdk selects on pointer move rather than on enter, so a list
 * scrolling under a still pointer leaves it; the pointer leaving keeps it.
 * The selected row holds the focus while the list does. A row gone hands the
 * selection, by its index, to the one that took its place.
 */
export const useListSelection = (keys: readonly string[]) => {
  const [selection, setSelection] = useState({ key: "", index: 0 });
  const gridRef = useRef<HTMLTableElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const focusedOnOpen = useRef(false);
  // The pointer's row is in view already; scrolling it would move the list
  // under the pointer.
  const scrollToSelected = useRef(true);

  const found = keys.indexOf(selection.key);
  const selectedIndex =
    found === -1 ? Math.min(selection.index, keys.length - 1) : found;
  const selectedKey = keys[selectedIndex];

  const select = (index: number) => {
    const key = keys[index];

    if (key !== undefined) {
      setSelection({ key, index });
    }
  };

  useLayoutEffect(() => {
    const grid = gridRef.current;
    const active = grid?.ownerDocument.activeElement;
    const inList =
      active === grid?.ownerDocument.body || (active && grid?.contains(active));
    const scroll = scrollToSelected.current;

    scrollToSelected.current = true;

    if (!inList) {
      return;
    }

    const element =
      selectedKey === undefined ? grid : rowRefs.current.get(selectedKey);

    element?.focus({ preventScroll: true });

    if (scroll) {
      element?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedKey]);

  // Opening puts focus on the first row, or the list when there is none;
  // later rows keep the selection.
  useEffect(() => {
    if (focusedOnOpen.current) {
      return;
    }

    focusedOnOpen.current = true;

    const element =
      selectedKey === undefined
        ? gridRef.current
        : rowRefs.current.get(selectedKey);

    element?.focus({ preventScroll: true });
  }, [selectedKey]);

  /** Selects the row at `index`, kept within the list, and focuses it. */
  const move = (index: number) => {
    const next = Math.max(0, Math.min(index, keys.length - 1));
    const key = keys[next];

    if (key !== undefined) {
      select(next);
      rowRefs.current.get(key)?.focus();
    }
  };

  /** What the row of `key`, at `index`, takes to be one of the list's. */
  const rowProps = (key: string, index: number) => {
    const selected = key === selectedKey;

    return {
      ref: (element: HTMLTableRowElement | null) => {
        if (element) {
          rowRefs.current.set(key, element);
        } else {
          rowRefs.current.delete(key);
        }
      },
      tabIndex: selected ? 0 : -1,
      "aria-selected": selected,
      "data-selected": selected || undefined,
      onFocus: () => {
        select(index);
      },
      onPointerMove: (event: PointerEvent) => {
        // Chromium makes up a move with none where the cursor rests as
        // what is under it changes, as the card opening over it.
        const moved = event.movementX !== 0 || event.movementY !== 0;

        if (moved && !selected) {
          scrollToSelected.current = false;
          select(index);
        }
      },
    };
  };

  return { gridRef, selectedIndex, selectedKey, move, rowProps };
};

export type ListRowProps = ReturnType<
  ReturnType<typeof useListSelection>["rowProps"]
>;

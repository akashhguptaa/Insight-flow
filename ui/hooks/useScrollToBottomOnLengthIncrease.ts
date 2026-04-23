"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Scrolls the container to the bottom when `length` increases (new items appended).
 * Does not scroll on in-place updates (same length), so manual scroll-up is preserved.
 */
export function useScrollToBottomOnLengthIncrease(
  containerRef: RefObject<HTMLElement | null>,
  length: number,
) {
  const prevLength = useRef(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      prevLength.current = length;
      return;
    }

    if (length > prevLength.current) {
      el.scrollTop = el.scrollHeight;
    }

    prevLength.current = length;
  }, [length, containerRef]);
}

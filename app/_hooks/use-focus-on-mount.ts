"use client";

import { useEffect, useRef } from "react";

/**
 * Moves focus to an element the moment it appears. Used for the error summary
 * after a failed submission and for a confirmation screen that replaces the
 * form it came from — otherwise focus is dropped onto the document body.
 */
export function useFocusOnMount<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (enabled) ref.current?.focus();
  }, [enabled]);
  return ref;
}

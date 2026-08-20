"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filters, sorting, and cursor paging belong to the URL so they survive reload,
 * back/forward, and sharing.
 */
export function useUrlFilters() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const setFilters = useCallback(
    (values: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    },
    [params, pathname, router],
  );

  return {
    filter: (key: string) => params.get(key) ?? "",
    setFilters,
  };
}

/**
 * Keeps a text input responsive while the committed value — the one the query
 * key is built from — only changes once typing pauses. A deferred value would
 * still fire a request per keystroke.
 */
export function useDebouncedInput(
  committed: string,
  commit: (value: string) => void,
  delay = 300,
) {
  const [draft, setDraft] = useState(committed);
  const [lastCommitted, setLastCommitted] = useState(committed);

  // Navigation (back/forward, a cleared filter) wins over the local draft.
  if (committed !== lastCommitted) {
    setLastCommitted(committed);
    setDraft(committed);
  }

  useEffect(() => {
    if (draft === committed) return;
    const timer = setTimeout(() => commit(draft), delay);
    return () => clearTimeout(timer);
  }, [commit, committed, delay, draft]);

  return [draft, setDraft] as const;
}

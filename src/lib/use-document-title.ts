"use client";

import { useEffect } from "react";

export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    document.title = title;
    // Next's route metadata commits after this effect, so keep the client title authoritative.
    const observer = new MutationObserver(() => {
      if (document.title !== title) document.title = title;
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}

"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "bs-theme";
const listeners = new Set<() => void>();

function read(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

/** Persisted dark mode. `.dark` on <html> drives both the design CSS and shadcn components. */
export function useDarkMode() {
  const dark = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => false,
  );

  const toggle = useCallback(() => {
    const next = !read();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* storage unavailable */
    }
    listeners.forEach((l) => l());
  }, []);

  return { dark, toggle };
}

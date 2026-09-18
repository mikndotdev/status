"use client";

import { useCallback, useSyncExternalStore } from "react";

import { DESKTOP_QUERY, resolveMode, storeMode, type ViewMode } from "@/lib/mode";

type Resolved = ViewMode | null | undefined;

let snapshot: Resolved;
let resolved = false;
const listeners = new Set<() => void>();

function getSnapshot(): Resolved {
  if (!resolved) {
    snapshot = resolveMode();
    resolved = true;
  }
  return snapshot;
}

function getServerSnapshot(): Resolved {
  return undefined;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  let media: MediaQueryList | null = null;
  const onBreakpointChange = () => {
    resolved = false;
    for (const current of listeners) current();
  };

  try {
    media = window.matchMedia(DESKTOP_QUERY);
    media.addEventListener("change", onBreakpointChange);
  } catch {
    media = null;
  }

  return () => {
    listeners.delete(listener);
    media?.removeEventListener("change", onBreakpointChange);
  };
}

export function useMode() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const select = useCallback((next: ViewMode) => {
    storeMode(next);
    snapshot = next;
    resolved = true;
    for (const listener of listeners) listener();
  }, []);

  return { mode, select };
}

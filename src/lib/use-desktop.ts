"use client";

import { useSyncExternalStore } from "react";

import { DESKTOP_QUERY } from "@/lib/mode";

function subscribe(listener: () => void) {
  let media: MediaQueryList | null = null;
  try {
    media = window.matchMedia(DESKTOP_QUERY);
    media.addEventListener("change", listener);
  } catch {
    media = null;
  }
  return () => media?.removeEventListener("change", listener);
}

function getSnapshot(): boolean {
  try {
    return window.matchMedia(DESKTOP_QUERY).matches;
  } catch {
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

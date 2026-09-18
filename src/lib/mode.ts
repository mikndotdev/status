export type ViewMode = "boring" | "cool";

export const MODE_STORAGE_KEY = "md-status:mode";

export function isViewMode(value: unknown): value is ViewMode {
  return value === "boring" || value === "cool";
}

export function readStoredMode(): ViewMode | null {
  try {
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    return isViewMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeMode(mode: ViewMode) {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {}
}

export function readQueryMode(): ViewMode | null {
  try {
    const value = new URLSearchParams(window.location.search).get("mode");
    return isViewMode(value) ? value : null;
  } catch {
    return null;
  }
}

export const DESKTOP_QUERY = "(min-width: 768px)";

export function isDesktop(): boolean {
  try {
    return window.matchMedia(DESKTOP_QUERY).matches;
  } catch {
    return true;
  }
}

export function resolveMode(): ViewMode | null {
  if (!isDesktop()) return "boring";
  return readQueryMode() ?? readStoredMode();
}

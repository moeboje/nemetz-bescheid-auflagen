import { isSafeModeActive } from "./safeMode";

export function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined" || isSafeModeActive()) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T) {
  if (typeof window === "undefined" || isSafeModeActive()) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore persistence errors for UI-only mock
  }
}

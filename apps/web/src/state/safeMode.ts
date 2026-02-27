const SAFE_MODE_PARAM = "safe";
const SAFE_MODE_VALUE = "1";

function getWindowLocationSearch() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.search;
}

export function isSafeModeActive(search?: string) {
  const params = new URLSearchParams(search ?? getWindowLocationSearch());
  return params.get(SAFE_MODE_PARAM) === SAFE_MODE_VALUE;
}

export function buildSafeModeUrl(enabled: boolean) {
  if (typeof window === "undefined") {
    return "";
  }
  const url = new URL(window.location.href);
  if (enabled) {
    url.searchParams.set(SAFE_MODE_PARAM, SAFE_MODE_VALUE);
  } else {
    url.searchParams.delete(SAFE_MODE_PARAM);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function enterSafeMode() {
  if (typeof window === "undefined") {
    return;
  }
  const nextUrl = buildSafeModeUrl(true);
  if (nextUrl) {
    window.location.assign(nextUrl);
  }
}

export function leaveSafeMode() {
  if (typeof window === "undefined") {
    return;
  }
  const nextUrl = buildSafeModeUrl(false);
  if (nextUrl) {
    window.location.assign(nextUrl);
  }
}

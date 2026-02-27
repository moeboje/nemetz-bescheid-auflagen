const DEFAULT_API_BASE = "/api";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export class ApiError extends Error {
  status: number;
  payload: JsonValue | null;

  constructor(status: number, message: string, payload: JsonValue | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function normalizeBaseUrl(value: string | undefined) {
  if (!value) {
    return "";
  }
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_URL);

function resolveUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (apiBaseUrl) {
    return `${apiBaseUrl}${normalizedPath}`;
  }

  return normalizedPath.startsWith(DEFAULT_API_BASE)
    ? normalizedPath
    : `${DEFAULT_API_BASE}${normalizedPath}`;
}

export function resolveApiUrl(path: string) {
  return resolveUrl(path);
}

type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: JsonValue;
};

export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined;

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(resolveUrl(path), {
    ...init,
    headers,
    credentials: "include",
    body: hasBody ? JSON.stringify(init.body) : undefined
  });

  const rawText = await response.text();
  let payload: JsonValue | null = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as JsonValue;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : response.statusText || "request_failed";
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

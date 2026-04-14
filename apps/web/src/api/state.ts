type ApiError = Error & { status?: number };

async function parseJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function loadServerState() {
  const res = await fetch("/api/state", {
    credentials: "include",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache"
    }
  });

  const json = await parseJsonSafe(res);

  if (!res.ok) {
    const err = new Error(json?.message ?? `Failed to load state: ${res.status}`) as ApiError;
    err.status = res.status;
    throw err;
  }

  return json;
}

export async function saveServerState(payload: unknown) {
  const res = await fetch("/api/state", {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache"
    },
    body: JSON.stringify(payload)
  });

  const json = await parseJsonSafe(res);

  if (!res.ok) {
    const err = new Error(json?.message ?? `Failed to save state: ${res.status}`) as ApiError;
    err.status = res.status;
    throw err;
  }

  return json;
}

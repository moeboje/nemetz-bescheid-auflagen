import { ApiError, apiRequest, resolveApiUrl } from "./client";

export type BrandingConfig = {
  hasLogo: boolean;
  hasIcon: boolean;
  logoUrl?: string;
  iconUrl?: string;
  updatedAt?: string;
};

export type BrandingAssetMetadata = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: string;
  url: string;
};

export type AdminDesignConfig = BrandingConfig & {
  logo?: BrandingAssetMetadata;
  icon?: BrandingAssetMetadata;
};

export type BrandingAssetKind = "logo" | "icon";

function parseErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return fallback;
}

async function parseJsonResponse(response: Response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function resolveBrandingAssetUrl(path?: string) {
  return path ? resolveApiUrl(path) : "";
}

export async function getBrandingConfig() {
  return apiRequest<BrandingConfig>("/branding", {
    method: "GET"
  });
}

export async function getAdminDesignConfig() {
  return apiRequest<AdminDesignConfig>("/admin/design", {
    method: "GET"
  });
}

export async function uploadAdminDesignAsset(kind: BrandingAssetKind, file: File) {
  const form = new FormData();
  form.set("file", file);

  const response = await fetch(resolveApiUrl(`/admin/design/${kind}`), {
    method: "POST",
    credentials: "include",
    body: form
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new ApiError(response.status, parseErrorMessage(payload, response.statusText || "request_failed"), payload);
  }

  if (!payload || typeof payload !== "object" || !("design" in payload)) {
    throw new ApiError(500, "Invalid design upload response.", payload);
  }

  return (payload as { design: AdminDesignConfig }).design;
}

export async function deleteAdminDesignAsset(kind: BrandingAssetKind) {
  const payload = await apiRequest<{ ok: boolean; design: AdminDesignConfig }>(`/admin/design/${kind}`, {
    method: "DELETE"
  });

  return payload.design;
}

import { normalizeAiAnalysisResult } from "../services/aiResultValidation";
import type { AiAnalysisResult, AiLanguage } from "../types/aiAnalysis";

export type AiAnalyzeMode = "mock" | "azure";

export type AnalyzeDocumentOptions = {
  mode?: AiAnalyzeMode;
  preferredLanguage?: AiLanguage;
  baseUrl?: string;
  signal?: AbortSignal;
};

export type AiAnalyzeErrorCode =
  | "FILE_TOO_LARGE"
  | "NO_PROVIDER"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE";

export class AiAnalyzeError extends Error {
  code: AiAnalyzeErrorCode;

  constructor(code: AiAnalyzeErrorCode, message: string) {
    super(message);
    this.name = "AiAnalyzeError";
    this.code = code;
  }
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = raw.indexOf(",");
      resolve(commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw);
    };
    reader.readAsDataURL(file);
  });
}

function normalizeErrorCode(value: unknown): AiAnalyzeErrorCode {
  if (value === "FILE_TOO_LARGE") {
    return "FILE_TOO_LARGE";
  }
  if (value === "NO_PROVIDER") {
    return "NO_PROVIDER";
  }
  if (value === "INVALID_RESPONSE") {
    return "INVALID_RESPONSE";
  }
  return "SERVER_ERROR";
}

export async function analyzeDocument(
  file: File,
  options: AnalyzeDocumentOptions = {}
): Promise<AiAnalysisResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new AiAnalyzeError("FILE_TOO_LARGE", "file_too_large");
  }

  const contentBase64 = await fileToBase64(file);

  let response: Response;
  try {
    response = await fetch(`${options.baseUrl ?? ""}/api/ai/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        contentBase64,
        preferredLanguage: options.preferredLanguage,
        mode: options.mode ?? "mock"
      }),
      signal: options.signal
    });
  } catch {
    throw new AiAnalyzeError("NETWORK_ERROR", "network_error");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AiAnalyzeError("INVALID_RESPONSE", "invalid_json");
  }

  if (!payload || typeof payload !== "object") {
    throw new AiAnalyzeError("INVALID_RESPONSE", "invalid_payload");
  }

  const row = payload as {
    ok?: boolean;
    result?: unknown;
    errorCode?: unknown;
    message?: unknown;
  };

  if (!response.ok || !row.ok) {
    const code = normalizeErrorCode(row.errorCode);
    const message = typeof row.message === "string" && row.message.trim() ? row.message : "server_error";
    throw new AiAnalyzeError(code, message);
  }

  return normalizeAiAnalysisResult(row.result);
}

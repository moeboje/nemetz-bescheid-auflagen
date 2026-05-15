import type { DocumentDto } from "../api/documents";
import { t } from "../i18n";

export type DocumentPreviewKind = "pdf" | "image";

const PREVIEW_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const PREVIEW_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/pjpeg", "image/webp", "image/gif"]);
const WORD_EXTENSIONS = [".doc", ".docx"];
const SPREADSHEET_EXTENSIONS = [".xls", ".xlsx", ".csv"];
const PRESENTATION_EXTENSIONS = [".ppt", ".pptx"];

type DocumentPresentationInput = Partial<Pick<DocumentDto, "filename" | "originalFilename" | "mimeType">> & {
  contentType?: string | null;
  fileStatus?: string | null;
};

function getDocumentFilename(document: Pick<DocumentPresentationInput, "filename" | "originalFilename">) {
  return document.originalFilename || document.filename || "";
}

export function getDocumentExtension(document: Pick<DocumentPresentationInput, "filename" | "originalFilename">) {
  const filename = getDocumentFilename(document);
  const index = filename.lastIndexOf(".");
  if (index < 0) {
    return "";
  }
  return filename.slice(index).toLowerCase();
}

function getStoredMimeType(document: Pick<DocumentPresentationInput, "mimeType" | "contentType">) {
  const rawMimeType = [document.mimeType, document.contentType].find(
    (value) => typeof value === "string" && value.trim()
  ) ?? "";
  return rawMimeType.split(";")[0].trim().toLowerCase();
}

export function getStoredMimePreviewKind(document: DocumentPresentationInput): DocumentPreviewKind | null {
  if (document.fileStatus === "FILE_MISSING") {
    return null;
  }

  const mimeType = getStoredMimeType(document);
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (PREVIEW_IMAGE_MIME_TYPES.has(mimeType)) {
    return "image";
  }
  return null;
}

export function isStoredMimePreviewable(document: DocumentPresentationInput) {
  return getStoredMimePreviewKind(document) !== null;
}

export function getDocumentPreviewKind(document: DocumentPresentationInput): DocumentPreviewKind | null {
  return getStoredMimePreviewKind(document);
}

export function isPreviewableDocument(document: DocumentPresentationInput) {
  return isStoredMimePreviewable(document);
}

export function getDocumentTypeLabel(document: DocumentPresentationInput) {
  const extension = getDocumentExtension(document).replace(".", "").toUpperCase();
  return extension || document.mimeType || document.contentType || t("common.notAvailable");
}

export function getDocumentFileTypeFilter(document: DocumentPresentationInput) {
  const extension = getDocumentExtension(document);
  if (extension === ".pdf") {
    return "PDF";
  }
  if (PREVIEW_IMAGE_EXTENSIONS.includes(extension)) {
    return t("documents.fileType.image");
  }
  if (WORD_EXTENSIONS.includes(extension)) {
    return "Word";
  }
  if (SPREADSHEET_EXTENSIONS.includes(extension)) {
    return "Excel/CSV";
  }
  if (PRESENTATION_EXTENSIONS.includes(extension)) {
    return "PowerPoint";
  }
  if (extension === ".txt") {
    return "TXT";
  }
  return t("common.notAvailable");
}

import React, { useMemo, useRef, useState } from "react";
import { Badge, Button, Select } from "@nemetz/ui";
import {
  fetchDocumentBlob,
  getDocumentApiErrorCode,
  type DocumentDto
} from "../api/documents";
import { t } from "../i18n";
import {
  ATTACHMENT_KIND_ORDER,
  countAttachmentsForRequirements,
  createStableId,
  inferAttachmentKind,
  type AttachmentKindCounts,
  type AttachmentKind,
  type AttachmentMeta,
  type AttachmentRequirements
} from "../types/attachments";
import { deleteFile, getFile, initFileDb, putFile } from "../services/fileStorage";
import { isStoredMimePreviewable } from "../utils/documentPresentation";
import DocumentPreviewModal from "./DocumentPreviewModal";

type EvidenceUploaderProps = {
  value: AttachmentMeta[];
  onChange: (next: AttachmentMeta[]) => void;
  allowedKinds?: AttachmentKind[];
  // Backward compatibility for existing call sites.
  allowKinds?: AttachmentKind[];
  required?: AttachmentRequirements;
  requirementCounts?: AttachmentKindCounts;
  errors?: string[];
  mode?: "edit" | "view";
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatSize(sizeKb?: number) {
  if (typeof sizeKb !== "number" || !Number.isFinite(sizeKb)) {
    return "";
  }
  return ` (${sizeKb} KB)`;
}

function kindLabel(kind: AttachmentKind) {
  if (kind === "PHOTO") {
    return t("attachments.kind.photo");
  }
  if (kind === "REPORT") {
    return t("attachments.kind.report");
  }
  return t("attachments.kind.document");
}

function getServerAttachmentDocumentId(attachment: AttachmentMeta) {
  if (attachment.storage !== "none" || !attachment.id.startsWith("doc-")) {
    return "";
  }
  return attachment.id.slice("doc-".length);
}

function toServerAttachmentDocument(attachment: AttachmentMeta): DocumentDto | null {
  const documentId = getServerAttachmentDocumentId(attachment);
  if (!documentId) {
    return null;
  }

  return {
    id: documentId,
    ownerType: "TASK_EVIDENCE",
    ownerId: "",
    category: "OTHER",
    fileVersion: 1,
    filename: attachment.filename,
    originalFilename: attachment.filename,
    mimeType: attachment.mime || "application/octet-stream",
    sizeBytes: Math.max(0, Math.round((attachment.sizeKb ?? 0) * 1024)),
    createdAt: attachment.addedAt,
    approvalRequired: false,
    approvalStatus: "NOT_REQUIRED"
  };
}

export default function EvidenceUploader({
  value,
  onChange,
  allowedKinds,
  allowKinds,
  required,
  requirementCounts,
  errors,
  mode = "edit"
}: EvidenceUploaderProps) {
  const photoCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const photoSelectInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const [serverPreviewDocument, setServerPreviewDocument] = useState<DocumentDto | undefined>(undefined);
  const [missingServerDocumentIds, setMissingServerDocumentIds] = useState<Set<string>>(() => new Set());
  const [storageHint, setStorageHint] = useState("");

  React.useEffect(() => {
    void initFileDb();
  }, []);

  const allowedKindsNormalized = useMemo(() => {
    const source = allowedKinds?.length
      ? allowedKinds
      : allowKinds?.length
      ? allowKinds
      : ATTACHMENT_KIND_ORDER;
    return ATTACHMENT_KIND_ORDER.filter((kind) => source.includes(kind));
  }, [allowKinds, allowedKinds]);

  const counts = useMemo(
    () => requirementCounts ?? countAttachmentsForRequirements(required, value),
    [requirementCounts, required, value]
  );
  const requiredRows = useMemo(
    () =>
      [
        {
          key: "PHOTO" as const,
          enabled: Boolean(required?.requirePhoto),
          current: counts.PHOTO,
          label: t("evidence.required.photo")
        },
        {
          key: "DOCUMENT" as const,
          enabled: Boolean(required?.requireDocument),
          current: counts.DOCUMENT,
          label: t("evidence.required.document")
        },
        {
          key: "REPORT" as const,
          enabled: Boolean(required?.requireReport),
          current: counts.REPORT,
          label: t("evidence.required.report")
        }
      ].filter((row) => row.enabled),
    [counts.DOCUMENT, counts.PHOTO, counts.REPORT, required?.requireDocument, required?.requirePhoto, required?.requireReport]
  );

  const resolveAttachmentKind = (file: File, preferredKind?: AttachmentKind): AttachmentKind => {
    const inferred = preferredKind ?? inferAttachmentKind({ mime: file.type, filename: file.name });
    if (allowedKindsNormalized.includes(inferred)) {
      return inferred;
    }
    return allowedKindsNormalized[0] ?? "DOCUMENT";
  };

  const appendFiles = async (files: File[], preferredKind?: AttachmentKind) => {
    if (!files.length) {
      return;
    }

    const newItems: AttachmentMeta[] = [];
    let hasNonPersistentFiles = false;

    for (const file of files) {
      const id = createStableId("att");
      let storage: "indexeddb" | "none" = "indexeddb";
      try {
        await putFile(id, file);
      } catch {
        storage = "none";
        hasNonPersistentFiles = true;
      }

      newItems.push({
        id,
        kind: resolveAttachmentKind(file, preferredKind),
        filename: file.name,
        sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
        mime: file.type || undefined,
        addedAt: todayISO(),
        storage
      });
    }

    onChange([...value, ...newItems]);

    if (hasNonPersistentFiles) {
      setStorageHint(t("attachments.storageNoneBadge"));
    }
  };

  const handleDownload = async (attachment: AttachmentMeta) => {
    if (attachment.storage === "none") {
      setStorageHint(t("attachments.contentMissing"));
      return;
    }
    const file = await getFile(attachment.id);
    if (!file) {
      setStorageHint(t("attachments.contentMissing"));
      return;
    }
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename || attachment.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const markServerDocumentMissing = React.useCallback((document: DocumentDto) => {
    setMissingServerDocumentIds((previous) => new Set(previous).add(document.id));
    setStorageHint(t("documents.fileMissingDetails"));
  }, []);

  const markServerDocumentNotFound = React.useCallback((document: DocumentDto) => {
    setMissingServerDocumentIds((previous) => new Set(previous).add(document.id));
    setStorageHint(t("documents.notFoundRefresh"));
  }, []);

  const handleServerDocumentDownload = React.useCallback(async (document: DocumentDto) => {
    try {
      const blob = await fetchDocumentBlob(document.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = objectUrl;
      link.download = document.originalFilename || document.filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      const errorCode = getDocumentApiErrorCode(downloadError);
      if (errorCode === "FILE_MISSING") {
        markServerDocumentMissing(document);
        return;
      }
      if (errorCode === "DOCUMENT_NOT_FOUND") {
        setMissingServerDocumentIds((previous) => new Set(previous).add(document.id));
        setStorageHint(t("documents.notFoundRefresh"));
        return;
      }
      setStorageHint(t("documents.error"));
    }
  }, [markServerDocumentMissing]);

  const handleRemove = async (attachment: AttachmentMeta) => {
    onChange(value.filter((item) => item.id !== attachment.id));
    if (attachment.storage === "indexeddb") {
      await deleteFile(attachment.id);
    }
  };

  return (
    <div className="evidenceUploader">
      {mode === "edit" ? (
        <div className="evidenceUploadSections">
          {allowedKindsNormalized.includes("PHOTO") ? (
            <div className="evidenceUploadSection">
              <div className="fieldLabel">{t("attachments.kind.photo")}</div>
              <div className="uploadRow uploadRowWrap">
                <Button variant="secondary" onClick={() => photoCaptureInputRef.current?.click()}>
                  {t("evidence.upload.photoCapture")}
                </Button>
                <input
                  ref={photoCaptureInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="fileInputHidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    void appendFiles(files, "PHOTO");
                    if (photoCaptureInputRef.current) {
                      photoCaptureInputRef.current.value = "";
                    }
                  }}
                />
                <Button variant="secondary" onClick={() => photoSelectInputRef.current?.click()}>
                  {t("evidence.upload.photoSelect")}
                </Button>
                <input
                  ref={photoSelectInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="fileInputHidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    void appendFiles(files, "PHOTO");
                    if (photoSelectInputRef.current) {
                      photoSelectInputRef.current.value = "";
                    }
                  }}
                />
              </div>
            </div>
          ) : null}

          {allowedKindsNormalized.includes("DOCUMENT") || allowedKindsNormalized.includes("REPORT") ? (
            <div className="evidenceUploadSection">
              <div className="fieldLabel">{t("attachments.kind.document")}</div>
              <div className="uploadRow uploadRowWrap">
                <Button variant="secondary" onClick={() => documentInputRef.current?.click()}>
                  {t("evidence.upload.documentAdd")}
                </Button>
                <input
                  ref={documentInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  className="fileInputHidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    void appendFiles(files);
                    if (documentInputRef.current) {
                      documentInputRef.current.value = "";
                    }
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {requiredRows.length ? (
        <div className="evidenceRequirementBox">
          <div className="fieldLabel">{t("evidence.requirements.title")}</div>
          <div className="evidenceRequirementList">
            {requiredRows.map((row) => {
              const isMissing = row.current < 1;
              return (
                <div key={row.key} className={isMissing ? "validationText" : "placeholderText"}>
                  {row.label}: {row.current}/1
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {value.length ? (
        <div className="fileList">
          {value.map((attachment) => {
            const serverDocument = toServerAttachmentDocument(attachment);
            const isServerDocumentMissing = Boolean(serverDocument && missingServerDocumentIds.has(serverDocument.id));
            return (
              <div key={attachment.id} className="evidenceAttachmentItem">
                <div className="evidenceAttachmentMeta">
                  <div>
                    {attachment.filename}
                    {formatSize(attachment.sizeKb)}
                  </div>
                  <div className="inlineMeta">
                    <Badge variant="neutral">{kindLabel(attachment.kind)}</Badge>
                    {isServerDocumentMissing ? (
                      <Badge variant="warning">{t("documents.fileMissing")}</Badge>
                    ) : attachment.storage === "none" && !serverDocument ? (
                      <Badge variant="warning">{t("attachments.storageNoneBadge")}</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="evidenceAttachmentActions">
                  {mode === "edit" ? (
                    <Select
                      options={allowedKindsNormalized.map((kind) => ({
                        value: kind,
                        label: kindLabel(kind)
                      }))}
                      value={attachment.kind}
                      onChange={(event) => {
                        const nextKind = event.target.value as AttachmentKind;
                        if (!allowedKindsNormalized.includes(nextKind)) {
                          return;
                        }
                        onChange(
                          value.map((item) =>
                            item.id === attachment.id
                              ? { ...item, kind: nextKind }
                              : item
                          )
                        );
                      }}
                    />
                  ) : null}

                  {serverDocument && !isServerDocumentMissing ? (
                    <>
                      {isStoredMimePreviewable(serverDocument) ? (
                        <Button size="sm" variant="secondary" onClick={() => setServerPreviewDocument(serverDocument)}>
                          {t("common.preview")}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="secondary" onClick={() => void handleServerDocumentDownload(serverDocument)}>
                        {t("common.download")}
                      </Button>
                    </>
                  ) : attachment.storage === "indexeddb" ? (
                    <Button size="sm" variant="secondary" onClick={() => void handleDownload(attachment)}>
                      {t("common.download")}
                    </Button>
                  ) : null}

                  {mode === "edit" ? (
                    <Button size="sm" variant="ghost" onClick={() => void handleRemove(attachment)}>
                      {t("common.remove")}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="placeholderText">{t("evidence.modal.noAttachments")}</p>
      )}

      {storageHint ? <p className="placeholderText">{storageHint}</p> : null}
      {errors?.length ? (
        <ul className="validationList">
          {errors.map((error) => (
            <li key={error} className="validationText">
              {error}
            </li>
          ))}
        </ul>
      ) : null}

      <DocumentPreviewModal
        open={Boolean(serverPreviewDocument)}
        document={serverPreviewDocument}
        onClose={() => setServerPreviewDocument(undefined)}
        onDownload={(document) => void handleServerDocumentDownload(document)}
        onFileMissing={markServerDocumentMissing}
        onDocumentNotFound={markServerDocumentNotFound}
      />
    </div>
  );
}

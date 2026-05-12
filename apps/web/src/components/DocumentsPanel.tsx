import React, { useMemo, useRef, useState } from "react";
import { Badge, Button, Modal } from "@nemetz/ui";
import {
  deleteDocument,
  fetchDocumentBlob,
  getDocumentApiErrorCode,
  listDocuments,
  replaceDocumentFile,
  uploadDocument,
  type DocumentDto,
  type DocumentOwnerType
} from "../api/documents";
import { ApiError } from "../api/client";
import { t, type I18nKey } from "../i18n";
import { getPendingDocumentUploads, uploadDocumentsSequentially } from "../services/documentUploadBatch";
import type { Attachment } from "../types/models";
import DocumentPreviewModal from "./DocumentPreviewModal";

type DocumentsPanelProps = {
  ownerType: DocumentOwnerType;
  ownerId: string;
  titleKey?: I18nKey;
  allowUpload?: boolean;
  allowManage?: boolean;
  showManageActions?: boolean;
  refreshKey?: string | number;
  onChanged?: () => void;
  legacyItems?: Attachment[];
};

function formatSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 KB";
  }
  const kb = Math.max(1, Math.ceil(sizeBytes / 1024));
  return `${kb} KB`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getExtension(filename: string) {
  const index = filename.lastIndexOf(".");
  if (index < 0) {
    return "";
  }
  return filename.slice(index).toLowerCase();
}

function isPreviewable(document: DocumentDto) {
  const mimeType = document.mimeType.toLowerCase();
  if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
    return true;
  }
  const extension = getExtension(document.originalFilename || document.filename);
  return [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(extension);
}

function getActionErrorMessage(error: unknown, fallbackKey: I18nKey) {
  const errorCode = getDocumentApiErrorCode(error);
  if (errorCode === "FILE_MISSING") {
    return t("documents.fileMissingDetails");
  }
  if (errorCode === "TASK_EVIDENCE_DELETE_BLOCKED") {
    return t("documents.taskEvidenceDeleteBlocked");
  }
  if (error instanceof ApiError && error.status === 403) {
    return t("documents.noPermission");
  }
  return t(fallbackKey);
}

export default function DocumentsPanel({
  ownerType,
  ownerId,
  titleKey = "documents.title",
  allowUpload = true,
  allowManage,
  showManageActions = false,
  refreshKey,
  onChanged,
  legacyItems
}: DocumentsPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [brokenIds, setBrokenIds] = useState<Set<string>>(() => new Set());
  const [uploadedFileKeysAfterPartialFailure, setUploadedFileKeysAfterPartialFailure] = useState<Set<string>>(
    () => new Set()
  );
  const [previewDocument, setPreviewDocument] = useState<DocumentDto | undefined>(undefined);
  const [replaceTarget, setReplaceTarget] = useState<DocumentDto | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<DocumentDto | undefined>(undefined);
  const canManageDocuments = Boolean((allowManage ?? allowUpload) && ownerType !== "TASK_EVIDENCE");

  const loadDocuments = React.useCallback(async () => {
    if (!ownerId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      const next = await listDocuments(ownerType, ownerId);
      setItems(next);
      setBrokenIds((previous) => {
        const nextIds = new Set(next.map((item) => item.id));
        return new Set([...previous].filter((id) => nextIds.has(id)));
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerType]);

  React.useEffect(() => {
    void loadDocuments();
  }, [loadDocuments, refreshKey]);

  React.useEffect(() => {
    setUploadedFileKeysAfterPartialFailure(new Set());
  }, [ownerId, ownerType]);

  const previewableById = useMemo(
    () =>
      new Map(
        items.map((item) => [item.id, isPreviewable(item)] as const)
      ),
    [items]
  );

  const handleUpload = async (files: File[]) => {
    if (!files.length || !ownerId) {
      return;
    }

    setUploading(true);
    setError(false);
    setActionError("");
    setActionMessage("");
    try {
      const pendingUploads = getPendingDocumentUploads(files, uploadedFileKeysAfterPartialFailure);
      const skippedUploadedFiles = files.length - pendingUploads.length;
      if (!pendingUploads.length) {
        setActionError(t("documents.partialUploadError"));
        return;
      }

      const result = await uploadDocumentsSequentially(pendingUploads, (entry) =>
        uploadDocument(ownerType, ownerId, entry.file)
      );
      const uploadedFileKeys = pendingUploads
        .slice(0, result.uploaded.length)
        .map((entry) => entry.fileKey);
      if (result.uploaded.length) {
        await loadDocuments();
        onChanged?.();
      }
      if (!result.completed) {
        if (uploadedFileKeys.length) {
          setUploadedFileKeysAfterPartialFailure((previous) => new Set([...previous, ...uploadedFileKeys]));
        }
        setActionError(
          result.uploaded.length || skippedUploadedFiles
            ? t("documents.partialUploadError")
            : getActionErrorMessage(result.error, "documents.uploadError")
        );
      } else {
        setUploadedFileKeysAfterPartialFailure(new Set());
      }
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setUploading(false);
    }
  };

  const markFileMissing = React.useCallback((document: DocumentDto) => {
    setBrokenIds((previous) => new Set(previous).add(document.id));
    setActionError(t("documents.fileMissingDetails"));
  }, []);

  const markDocumentNotFound = React.useCallback((document: DocumentDto) => {
    setItems((previous) => previous.filter((item) => item.id !== document.id));
    setBrokenIds((previous) => {
      const next = new Set(previous);
      next.delete(document.id);
      return next;
    });
    setActionError(t("documents.notFoundRefresh"));
    void loadDocuments();
  }, [loadDocuments]);

  const handleDownload = async (document: DocumentDto) => {
    setActionError("");
    setActionMessage("");
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
        markFileMissing(document);
        return;
      }
      if (errorCode === "DOCUMENT_NOT_FOUND") {
        markDocumentNotFound(document);
        return;
      }
      setActionError(getActionErrorMessage(downloadError, "documents.error"));
    }
  };

  const openReplacePicker = (document: DocumentDto) => {
    setReplaceTarget(document);
    setActionError("");
    setActionMessage("");
    replaceInputRef.current?.click();
  };

  const handleReplace = async (file: File | undefined) => {
    if (!file || !replaceTarget) {
      return;
    }

    setReplacing(true);
    setActionError("");
    setActionMessage("");
    try {
      const updated = await replaceDocumentFile(replaceTarget.id, file);
      setItems((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
      setBrokenIds((previous) => {
        const next = new Set(previous);
        next.delete(updated.id);
        return next;
      });
      setActionMessage(t("documents.replaceSuccess"));
      onChanged?.();
    } catch (replaceError) {
      setActionError(getActionErrorMessage(replaceError, "documents.replaceError"));
    } finally {
      setReplacing(false);
      setReplaceTarget(undefined);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    setActionError("");
    setActionMessage("");
    try {
      await deleteDocument(deleteTarget.id);
      setItems((previous) => previous.filter((item) => item.id !== deleteTarget.id));
      setBrokenIds((previous) => {
        const next = new Set(previous);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(undefined);
      setActionMessage(t("documents.removeSuccess"));
      onChanged?.();
    } catch (deleteError) {
      setActionError(getActionErrorMessage(deleteError, "documents.removeError"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="formField">
      <span className="fieldLabel">{t(titleKey)}</span>
      {allowUpload ? (
        <div className="uploadRow">
          <Button
            variant="secondary"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? t("documents.loading") : items.length ? t("documents.upload") : t("documents.addFile")}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="fileInputHidden"
            accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              void handleUpload(files);
              if (inputRef.current) {
                inputRef.current.value = "";
              }
            }}
          />
        </div>
      ) : null}
      {canManageDocuments ? (
        <input
          ref={replaceInputRef}
          type="file"
          className="fileInputHidden"
          accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          onChange={(event) => {
            const file = event.target.files?.[0];
            void handleReplace(file);
            if (replaceInputRef.current) {
              replaceInputRef.current.value = "";
            }
          }}
        />
      ) : null}

      {loading ? <p className="placeholderText">{t("documents.loading")}</p> : null}
      {error ? <p className="validationText">{t("documents.error")}</p> : null}
      {actionError ? <p className="validationText">{actionError}</p> : null}
      {actionMessage ? <p className="placeholderText">{actionMessage}</p> : null}

      {!loading ? (
        items.length ? (
          <div className="fileList">
            {items.map((item) => {
              const isBroken = brokenIds.has(item.id);
              const canShowManageActions = canManageDocuments && (showManageActions || isBroken);
              return (
                <div key={item.id} className="documentsItem">
                  <div className="documentsItemMeta">
                    <div>{item.originalFilename || item.filename}</div>
                    <div className="inlineMeta">
                      <Badge variant="neutral">{item.mimeType || t("common.notAvailable")}</Badge>
                      {isBroken ? <Badge variant="warning">{t("documents.fileMissing")}</Badge> : null}
                      <span>{formatSize(item.sizeBytes)}</span>
                    </div>
                    <div className="inlineMeta">
                      <span>{t("documents.uploadedAt")}: {formatDateTime(item.createdAt)}</span>
                      <span>
                        {t("documents.uploadedBy")}: {item.createdByLabel || t("common.notAvailable")}
                      </span>
                    </div>
                    {isBroken ? (
                      <p className="placeholderText">{t("documents.fileMissingDetails")}</p>
                    ) : null}
                  </div>
                  <div className="documentsItemActions">
                    {previewableById.get(item.id) ? (
                      <Button size="sm" variant="secondary" onClick={() => setPreviewDocument(item)}>
                        {t("documents.preview")}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="secondary" onClick={() => void handleDownload(item)}>
                      {t("documents.download")}
                    </Button>
                    {canShowManageActions ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={replacing}
                          onClick={() => openReplacePicker(item)}
                        >
                          {t("documents.replaceFile")}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={deleting}
                          onClick={() => {
                            setActionError("");
                            setActionMessage("");
                            setDeleteTarget(item);
                          }}
                        >
                          {t("documents.removeEntry")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="placeholderText">{t("documents.empty")}</p>
        )
      ) : null}

      {legacyItems?.length ? (
        <div className="documentsLegacy">
          <span className="fieldLabel">{t("documents.legacyBrowser")}</span>
          <p className="placeholderText">{t("documents.legacyBrowserHint")}</p>
          <div className="fileList">
            {legacyItems.map((item) => (
              <div key={item.id} className="documentsItem">
                <div className="documentsItemMeta">
                  <div>{item.filename}</div>
                  <div className="inlineMeta">
                    <Badge variant="warning">{t("documents.legacyBrowser")}</Badge>
                    <span>{item.sizeKb} KB</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <DocumentPreviewModal
        open={Boolean(previewDocument)}
        document={previewDocument}
        onClose={() => setPreviewDocument(undefined)}
        onDownload={(document) => void handleDownload(document)}
        onFileMissing={markFileMissing}
        onDocumentNotFound={markDocumentNotFound}
      />
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(undefined)}
        closeAriaLabel={t("modal.close")}
        header={t("documents.confirmRemoveTitle")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setDeleteTarget(undefined)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? t("documents.loading") : t("documents.removeEntry")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <p className="placeholderText">{t("documents.confirmRemoveText")}</p>
          {deleteTarget ? (
            <p className="metaValue">{deleteTarget.originalFilename || deleteTarget.filename}</p>
          ) : null}
          {actionError ? <p className="validationText">{actionError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

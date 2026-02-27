import React, { useMemo, useRef, useState } from "react";
import { Badge, Button } from "@nemetz/ui";
import {
  fetchDocumentBlob,
  listDocuments,
  uploadDocument,
  type DocumentDto,
  type DocumentOwnerType
} from "../api/documents";
import { t, type I18nKey } from "../i18n";
import type { Attachment } from "../types/models";
import DocumentPreviewModal from "./DocumentPreviewModal";

type DocumentsPanelProps = {
  ownerType: DocumentOwnerType;
  ownerId: string;
  titleKey?: I18nKey;
  allowUpload?: boolean;
  legacyItems?: Attachment[];
};

function formatSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 KB";
  }
  const kb = Math.max(1, Math.ceil(sizeBytes / 1024));
  return `${kb} KB`;
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

export default function DocumentsPanel({
  ownerType,
  ownerId,
  titleKey = "documents.title",
  allowUpload = true,
  legacyItems
}: DocumentsPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DocumentDto | undefined>(undefined);

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
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerType]);

  React.useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

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
    try {
      for (const file of files) {
        await uploadDocument(ownerType, ownerId, file);
      }
      await loadDocuments();
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (document: DocumentDto) => {
    try {
      const blob = await fetchDocumentBlob(document.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = objectUrl;
      link.download = document.originalFilename || document.filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError(true);
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
            {uploading ? t("documents.loading") : t("documents.upload")}
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

      {loading ? <p className="placeholderText">{t("documents.loading")}</p> : null}
      {error ? <p className="validationText">{t("documents.error")}</p> : null}

      {!loading ? (
        items.length ? (
          <div className="fileList">
            {items.map((item) => (
              <div key={item.id} className="documentsItem">
                <div className="documentsItemMeta">
                  <div>{item.originalFilename || item.filename}</div>
                  <div className="inlineMeta">
                    <Badge variant="neutral">{item.mimeType || t("common.notAvailable")}</Badge>
                    <span>{formatSize(item.sizeBytes)}</span>
                  </div>
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
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="placeholderText">{t("documents.empty")}</p>
        )
      ) : null}

      {legacyItems?.length ? (
        <div className="documentsLegacy">
          <span className="fieldLabel">{t("documents.legacyBrowser")}</span>
          <div className="fileList">
            {legacyItems.map((item) => (
              <div key={item.id} className="fileItem">
                <div>
                  {item.filename} ({item.sizeKb} KB)
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
      />
    </div>
  );
}

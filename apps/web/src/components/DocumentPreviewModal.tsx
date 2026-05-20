import React, { useMemo, useState } from "react";
import { Button, Modal } from "@nemetz/ui";
import { fetchDocumentBlob, getDocumentApiErrorCode } from "../api/documents";
import { t } from "../i18n";
import type { DocumentDto } from "../api/documents";
import type { DocumentsMutationScope } from "../state/DocumentsStore";
import { getStoredMimePreviewKind, isStoredMimePreviewable } from "../utils/documentPresentation";
import PdfViewer from "./PdfViewer";
import { notifyDocumentPreviewMissingCallback } from "./documentPreviewMissingCallbacks";

type DocumentPreviewModalProps = {
  open: boolean;
  document?: DocumentDto;
  onClose: () => void;
  onDownload: (document: DocumentDto) => void;
  captureMutationScope?: (document: DocumentDto) => DocumentsMutationScope | null;
  onFileMissing?: (document: DocumentDto, mutationScope: DocumentsMutationScope) => void;
  onDocumentNotFound?: (document: DocumentDto, mutationScope: DocumentsMutationScope) => void;
  onPreviewFileMissing?: (document: DocumentDto) => void;
  onPreviewDocumentNotFound?: (document: DocumentDto) => void;
};

export default function DocumentPreviewModal({
  open,
  document,
  onClose,
  onDownload,
  captureMutationScope,
  onFileMissing,
  onDocumentNotFound,
  onPreviewFileMissing,
  onPreviewDocumentNotFound
}: DocumentPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [fileMissing, setFileMissing] = useState(false);
  const [objectUrl, setObjectUrl] = useState("");
  const captureMutationScopeRef = React.useRef(captureMutationScope);
  const missingCallbacksRef = React.useRef({
    onFileMissing,
    onDocumentNotFound,
    onPreviewFileMissing,
    onPreviewDocumentNotFound
  });

  React.useEffect(() => {
    captureMutationScopeRef.current = captureMutationScope;
  }, [captureMutationScope]);

  React.useEffect(() => {
    missingCallbacksRef.current = {
      onFileMissing,
      onDocumentNotFound,
      onPreviewFileMissing,
      onPreviewDocumentNotFound
    };
  }, [onDocumentNotFound, onFileMissing, onPreviewDocumentNotFound, onPreviewFileMissing]);

  React.useEffect(() => {
    if (!open || !document || !isStoredMimePreviewable(document)) {
      setObjectUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return "";
      });
      setLoading(false);
      setError(false);
      setFileMissing(false);
      return;
    }

    let isCancelled = false;
    let nextObjectUrl = "";
    const mutationScope = captureMutationScopeRef.current?.(document) ?? null;

    setLoading(true);
    setError(false);
    setFileMissing(false);

    void fetchDocumentBlob(document.id)
      .then((blob) => {
        if (isCancelled) {
          return;
        }
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous);
          }
          return nextObjectUrl;
        });
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }
        const errorCode = getDocumentApiErrorCode(error);
        const missingResult = notifyDocumentPreviewMissingCallback(
          errorCode,
          document,
          mutationScope,
          missingCallbacksRef.current
        );
        if (missingResult === "file-missing") {
          setFileMissing(true);
        }
        setError(true);
      })
      .finally(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [document, open]);

  React.useEffect(
    () => () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    },
    [objectUrl]
  );

  const content = useMemo(() => {
    if (!document) {
      return null;
    }

    const previewKind = getStoredMimePreviewKind(document);

    if (!previewKind) {
      return <p className="placeholderText">{t("documents.noPreview")}</p>;
    }

    if (loading) {
      return <p className="placeholderText">{t("documents.loading")}</p>;
    }

    if (fileMissing) {
      return <p className="placeholderText">{t("documents.fileMissingDetails")}</p>;
    }

    if (error || !objectUrl) {
      return <p className="placeholderText">{t("documents.error")}</p>;
    }

    if (previewKind === "pdf") {
      return <PdfViewer url={objectUrl} filename={document.originalFilename || document.filename} />;
    }

    if (previewKind === "image") {
      return (
        <img
          src={objectUrl}
          alt={document.originalFilename || document.filename}
          className="documentsPreviewImage"
        />
      );
    }

    return <p className="placeholderText">{t("documents.noPreview")}</p>;
  }, [document, error, fileMissing, loading, objectUrl]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      className="documentsPreviewModal"
      mobileFullscreen
      header={document?.originalFilename || document?.filename || t("documents.preview")}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
          {document ? (
            <Button variant="secondary" onClick={() => onDownload(document)}>
              {t("documents.download")}
            </Button>
          ) : null}
        </div>
      }
    >
      {content}
    </Modal>
  );
}

import React, { useMemo, useState } from "react";
import { Button, Modal } from "@nemetz/ui";
import { fetchDocumentBlob, getDocumentApiErrorCode } from "../api/documents";
import { t } from "../i18n";
import type { DocumentDto } from "../api/documents";
import PdfViewer from "./PdfViewer";

type DocumentPreviewModalProps = {
  open: boolean;
  document?: DocumentDto;
  onClose: () => void;
  onDownload: (document: DocumentDto) => void;
  onFileMissing?: (document: DocumentDto) => void;
  onDocumentNotFound?: (document: DocumentDto) => void;
};

function isPdf(mimeType: string) {
  return mimeType.toLowerCase() === "application/pdf";
}

function isImage(mimeType: string) {
  return mimeType.toLowerCase().startsWith("image/");
}

function hasPreview(document: DocumentDto) {
  return isPdf(document.mimeType) || isImage(document.mimeType);
}

export default function DocumentPreviewModal({
  open,
  document,
  onClose,
  onDownload,
  onFileMissing,
  onDocumentNotFound
}: DocumentPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [fileMissing, setFileMissing] = useState(false);
  const [objectUrl, setObjectUrl] = useState("");

  React.useEffect(() => {
    if (!open || !document || !hasPreview(document)) {
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
        if (errorCode === "FILE_MISSING") {
          setFileMissing(true);
          onFileMissing?.(document);
        } else if (errorCode === "DOCUMENT_NOT_FOUND") {
          onDocumentNotFound?.(document);
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
  }, [document, onDocumentNotFound, onFileMissing, open]);

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

    if (!hasPreview(document)) {
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

    if (isPdf(document.mimeType)) {
      return <PdfViewer url={objectUrl} filename={document.originalFilename || document.filename} />;
    }

    if (isImage(document.mimeType)) {
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

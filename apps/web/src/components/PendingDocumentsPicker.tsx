import React, { useRef } from "react";
import { Badge, Button } from "@nemetz/ui";
import { t } from "../i18n";

type PendingDocumentsPickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

function formatSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 KB";
  }
  const kb = Math.max(1, Math.ceil(sizeBytes / 1024));
  return `${kb} KB`;
}

export default function PendingDocumentsPicker({
  files,
  onChange,
  disabled = false
}: PendingDocumentsPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (nextFiles: File[]) => {
    if (!nextFiles.length) {
      return;
    }
    onChange([...files, ...nextFiles]);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, fileIndex) => fileIndex !== index));
  };

  return (
    <div className="formField">
      <span className="fieldLabel">{t("evidence.documents.pendingTitle")}</span>
      <div className="uploadRow">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {files.length ? t("evidence.documents.addMore") : t("evidence.documents.add")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="fileInputHidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            if (inputRef.current) {
              inputRef.current.value = "";
            }
          }}
        />
      </div>
      {files.length ? (
        <div className="fileList">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.lastModified}-${index}`} className="documentsItem">
              <div className="documentsItemMeta">
                <div>{file.name}</div>
                <div className="inlineMeta">
                  <Badge variant="neutral">{file.type || t("common.notAvailable")}</Badge>
                  <span>{formatSize(file.size)}</span>
                </div>
              </div>
              <div className="documentsItemActions">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => removeFile(index)}
                >
                  {t("evidence.documents.removePending")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="placeholderText">{t("evidence.documents.nonePending")}</p>
      )}
    </div>
  );
}

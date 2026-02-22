import React, { useRef } from "react";
import { Button } from "@nemetz/ui";

export type UploadItem = {
  id: string;
  filename: string;
  sizeKb: number;
  addedAt: string;
};

type FileUploadStubProps = {
  label: string;
  selectLabel: string;
  removeLabel: string;
  items: UploadItem[];
  disabled?: boolean;
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
};

export default function FileUploadStub({
  label,
  selectLabel,
  removeLabel,
  items,
  disabled = false,
  onAddFiles,
  onRemove
}: FileUploadStubProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="formField">
      <span className="fieldLabel">{label}</span>
      <div className="uploadRow">
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {selectLabel}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={disabled}
          onChange={(event) => {
            if (disabled) {
              return;
            }
            const nextFiles = Array.from(event.target.files ?? []);
            if (nextFiles.length) {
              onAddFiles(nextFiles);
            }
            if (inputRef.current) {
              inputRef.current.value = "";
            }
          }}
          className="fileInputHidden"
        />
      </div>
      {items.length ? (
        <div className="fileList">
          {items.map((file) => (
            <div key={file.id} className="fileItem">
              <div>
                {file.filename} ({file.sizeKb} KB)
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onRemove(file.id)}
              >
                {removeLabel}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type DocumentUploadBatchResult<TDocument> = {
  uploaded: TDocument[];
  error?: unknown;
  completed: boolean;
};

export type DocumentUploadFile = Pick<File, "name" | "type" | "size" | "lastModified">;

export type PendingDocumentUpload<TFile> = {
  file: TFile;
  fileKey: string;
};

export function createDocumentUploadFileKey(file: DocumentUploadFile) {
  return [file.name, file.type, file.size, file.lastModified].join(":");
}

export function getPendingDocumentUploads<TFile extends DocumentUploadFile>(
  files: TFile[],
  uploadedFileKeys: Set<string>
): Array<PendingDocumentUpload<TFile>> {
  return files
    .map((file) => ({
      file,
      fileKey: createDocumentUploadFileKey(file)
    }))
    .filter((entry) => !uploadedFileKeys.has(entry.fileKey));
}

export async function uploadDocumentsSequentially<TFile, TDocument>(
  files: TFile[],
  uploadFile: (file: TFile, index: number) => Promise<TDocument>
): Promise<DocumentUploadBatchResult<TDocument>> {
  const uploaded: TDocument[] = [];

  for (let index = 0; index < files.length; index += 1) {
    try {
      uploaded.push(await uploadFile(files[index], index));
    } catch (error) {
      return {
        uploaded,
        error,
        completed: false
      };
    }
  }

  return {
    uploaded,
    completed: true
  };
}

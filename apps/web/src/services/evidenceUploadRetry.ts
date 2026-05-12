import type { PendingEvidenceFile } from "./evidenceValidation";

export type UploadedEvidenceFile = {
  fileKey: string;
  documentId: string;
};

export function createPendingEvidenceFileKey(file: PendingEvidenceFile, index: number) {
  return [index, file.name, file.type, file.size, file.lastModified].join(":");
}

export function getPendingEvidenceFilesToUpload(
  files: PendingEvidenceFile[],
  uploadedFiles: UploadedEvidenceFile[]
) {
  const uploadedKeys = new Set(uploadedFiles.map((entry) => entry.fileKey));
  return files
    .map((file, index) => ({
      file,
      fileKey: createPendingEvidenceFileKey(file, index)
    }))
    .filter((entry) => !uploadedKeys.has(entry.fileKey));
}

export function mergeEvidenceDocumentIds(...idGroups: Array<Iterable<string | undefined>>) {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const group of idGroups) {
    for (const value of group) {
      const id = value?.trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

export function mergeUploadedEvidenceFiles(
  uploadedFiles: UploadedEvidenceFile[],
  nextUploadedFile: UploadedEvidenceFile
) {
  if (uploadedFiles.some((entry) => entry.fileKey === nextUploadedFile.fileKey)) {
    return uploadedFiles.map((entry) =>
      entry.fileKey === nextUploadedFile.fileKey ? nextUploadedFile : entry
    );
  }
  return [...uploadedFiles, nextUploadedFile];
}

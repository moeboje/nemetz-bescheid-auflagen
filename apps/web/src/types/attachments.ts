export type AttachmentKind = "PHOTO" | "DOCUMENT" | "REPORT";

export type AttachmentStorage = "indexeddb" | "none";

export type AttachmentMeta = {
  id: string;
  kind: AttachmentKind;
  filename: string;
  sizeKb?: number;
  mime?: string;
  addedAt: string;
  storage: AttachmentStorage;
};

export type AttachmentRequirements = {
  requirePhoto?: boolean;
  requireDocument?: boolean;
  requireReport?: boolean;
};

export const ATTACHMENT_KIND_ORDER: AttachmentKind[] = ["PHOTO", "DOCUMENT", "REPORT"];

export function createStableId(prefix = "id") {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionOf(filename?: string) {
  if (!filename) {
    return "";
  }
  const segments = filename.toLowerCase().split(".");
  return segments.length > 1 ? segments[segments.length - 1] : "";
}

export function inferAttachmentKind(input: { mime?: string; filename?: string }): AttachmentKind {
  const mime = input.mime?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) {
    return "PHOTO";
  }
  if (mime === "application/pdf") {
    return "REPORT";
  }

  const extension = extensionOf(input.filename);
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tif", "tiff"].includes(extension)) {
    return "PHOTO";
  }
  if (extension === "pdf") {
    return "REPORT";
  }
  return "DOCUMENT";
}

export type AttachmentKindCounts = Record<AttachmentKind, number>;

export function countAttachmentsByKind(attachments: AttachmentMeta[]): AttachmentKindCounts {
  return attachments.reduce<AttachmentKindCounts>(
    (acc, attachment) => {
      if (attachment.kind === "PHOTO" || attachment.kind === "DOCUMENT" || attachment.kind === "REPORT") {
        acc[attachment.kind] += 1;
      }
      return acc;
    },
    {
      PHOTO: 0,
      DOCUMENT: 0,
      REPORT: 0
    }
  );
}

function createEmptyKindCounts(): AttachmentKindCounts {
  return {
    PHOTO: 0,
    DOCUMENT: 0,
    REPORT: 0
  };
}

function getRequiredAttachmentKindOrder(
  requirements: AttachmentRequirements | undefined
): AttachmentKind[] {
  if (!requirements) {
    return [];
  }

  const requiredKinds: AttachmentKind[] = [];
  if (requirements.requirePhoto) {
    requiredKinds.push("PHOTO");
  }
  if (requirements.requireDocument) {
    requiredKinds.push("DOCUMENT");
  }
  if (requirements.requireReport) {
    requiredKinds.push("REPORT");
  }
  return requiredKinds;
}

function consumeMatchingAttachment(
  remaining: AttachmentMeta[],
  predicate: (attachment: AttachmentMeta) => boolean
) {
  const index = remaining.findIndex(predicate);
  if (index < 0) {
    return false;
  }
  remaining.splice(index, 1);
  return true;
}

export function countAttachmentsForRequirements(
  requirements: AttachmentRequirements | undefined,
  attachments: AttachmentMeta[]
): AttachmentKindCounts {
  const counts = createEmptyKindCounts();
  const requiredKinds = getRequiredAttachmentKindOrder(requirements);
  if (!requiredKinds.length) {
    return counts;
  }

  const remaining = [...attachments];

  if (requiredKinds.includes("PHOTO") && consumeMatchingAttachment(remaining, (item) => item.kind === "PHOTO")) {
    counts.PHOTO = 1;
  }

  if (requiredKinds.includes("REPORT") && consumeMatchingAttachment(remaining, (item) => item.kind === "REPORT")) {
    counts.REPORT = 1;
  }

  if (
    requiredKinds.includes("DOCUMENT") &&
    (consumeMatchingAttachment(remaining, (item) => item.kind === "DOCUMENT") ||
      consumeMatchingAttachment(remaining, (item) => item.kind === "REPORT"))
  ) {
    counts.DOCUMENT = 1;
  }

  return counts;
}

export function getMissingRequiredAttachmentKinds(
  requirements: AttachmentRequirements | undefined,
  attachments: AttachmentMeta[]
): AttachmentKind[] {
  if (!requirements) {
    return [];
  }

  const counts = countAttachmentsForRequirements(requirements, attachments);
  const missing: AttachmentKind[] = [];

  if (requirements.requirePhoto && counts.PHOTO < 1) {
    missing.push("PHOTO");
  }
  if (requirements.requireDocument && counts.DOCUMENT < 1) {
    missing.push("DOCUMENT");
  }
  if (requirements.requireReport && counts.REPORT < 1) {
    missing.push("REPORT");
  }

  return missing;
}

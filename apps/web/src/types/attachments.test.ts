import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countAttachmentsForRequirements,
  getMissingRequiredAttachmentKinds,
  type AttachmentKind,
  type AttachmentMeta,
  type AttachmentRequirements
} from "./attachments";

function attachment(kind: AttachmentKind, filename = `${kind.toLowerCase()}.dat`): AttachmentMeta {
  return {
    id: `att-${kind}-${filename}`,
    kind,
    filename,
    addedAt: "2026-04-29",
    storage: "indexeddb"
  };
}

function counts(requirements: AttachmentRequirements, attachments: AttachmentMeta[]) {
  return countAttachmentsForRequirements(requirements, attachments);
}

describe("attachment requirement matching", () => {
  it("satisfies a photo requirement with a photo attachment", () => {
    const result = counts({ requirePhoto: true }, [attachment("PHOTO", "foto.jpg")]);

    assert.equal(result.PHOTO, 1);
    assert.deepEqual(
      getMissingRequiredAttachmentKinds({ requirePhoto: true }, [attachment("PHOTO", "foto.jpg")]),
      []
    );
  });

  it("satisfies a document requirement with a document attachment", () => {
    const result = counts({ requireDocument: true }, [attachment("DOCUMENT", "nachweis.docx")]);

    assert.equal(result.DOCUMENT, 1);
    assert.deepEqual(
      getMissingRequiredAttachmentKinds({ requireDocument: true }, [attachment("DOCUMENT", "nachweis.docx")]),
      []
    );
  });

  it("satisfies a document requirement with a report attachment", () => {
    const result = counts({ requireDocument: true }, [attachment("REPORT", "pruefdokument.pdf")]);

    assert.equal(result.DOCUMENT, 1);
    assert.deepEqual(
      getMissingRequiredAttachmentKinds({ requireDocument: true }, [attachment("REPORT", "pruefdokument.pdf")]),
      []
    );
  });

  it("does not satisfy a document requirement with only a photo", () => {
    assert.deepEqual(
      getMissingRequiredAttachmentKinds({ requireDocument: true }, [attachment("PHOTO", "foto.jpg")]),
      ["DOCUMENT"]
    );
  });

  it("becomes missing again when the valid document is removed", () => {
    assert.deepEqual(getMissingRequiredAttachmentKinds({ requireDocument: true }, []), ["DOCUMENT"]);
  });

  it("updates requirement matching when an attachment type changes to a valid document kind", () => {
    const invalid = [attachment("PHOTO", "nachweis.pdf")];
    const valid = [{ ...invalid[0], kind: "REPORT" as const }];

    assert.deepEqual(getMissingRequiredAttachmentKinds({ requireDocument: true }, invalid), ["DOCUMENT"]);
    assert.deepEqual(getMissingRequiredAttachmentKinds({ requireDocument: true }, valid), []);
  });

  it("does not count a single report for both document and report requirements", () => {
    const missing = getMissingRequiredAttachmentKinds(
      { requireDocument: true, requireReport: true },
      [attachment("REPORT", "pruefdokument.pdf")]
    );

    assert.deepEqual(missing, ["DOCUMENT"]);
  });

  it("satisfies document and report requirements with two matching attachments", () => {
    const missing = getMissingRequiredAttachmentKinds(
      { requireDocument: true, requireReport: true },
      [attachment("REPORT", "pruefdokument.pdf"), attachment("DOCUMENT", "protokoll.docx")]
    );

    assert.deepEqual(missing, []);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDocumentPreviewKind,
  getStoredMimePreviewKind,
  isStoredMimePreviewable
} from "./documentPresentation";

describe("document preview presentation", () => {
  it("allows PDF preview by stored MIME regardless of filename", () => {
    assert.equal(
      getStoredMimePreviewKind({
        mimeType: "application/pdf",
        filename: "dokument.docx"
      }),
      "pdf"
    );
  });

  it("allows supported image preview by stored MIME regardless of filename", () => {
    for (const mimeType of ["image/png", "image/jpeg", "image/pjpeg", "image/webp", "image/gif"]) {
      assert.equal(
        getStoredMimePreviewKind({
          mimeType,
          filename: "dokument.pdf"
        }),
        "image"
      );
    }
  });

  it("allows progressive JPEG preview by stored MIME when filename has no image extension", () => {
    assert.equal(
      getStoredMimePreviewKind({
        mimeType: "image/pjpeg",
        filename: "scan.dat"
      }),
      "image"
    );
  });

  it("does not allow Word preview when filename looks like a PDF", () => {
    assert.equal(
      isStoredMimePreviewable({
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: "dokument.pdf"
      }),
      false
    );
  });

  it("does not allow Office preview when filename looks like an image", () => {
    assert.equal(
      isStoredMimePreviewable({
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: "dokument.jpg"
      }),
      false
    );
  });

  it("does not allow Excel preview when filename looks like a PDF", () => {
    assert.equal(
      isStoredMimePreviewable({
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: "dokument.pdf"
      }),
      false
    );
  });

  it("does not allow text preview when filename looks like an image", () => {
    assert.equal(
      isStoredMimePreviewable({
        mimeType: "text/plain",
        filename: "bild.png"
      }),
      false
    );
  });

  it("does not allow preview when MIME is missing even if filename looks previewable", () => {
    for (const filename of ["dokument.pdf", "bild.jpg"]) {
      assert.equal(
        isStoredMimePreviewable({
          filename
        }),
        false
      );
    }
  });

  it("does not allow preview for FILE_MISSING even with PDF MIME", () => {
    assert.equal(
      isStoredMimePreviewable({
        mimeType: "application/pdf",
        filename: "dokument.pdf",
        fileStatus: "FILE_MISSING"
      }),
      false
    );
  });

  it("does not allow preview for FILE_MISSING even with progressive JPEG MIME", () => {
    assert.equal(
      isStoredMimePreviewable({
        mimeType: "image/pjpeg",
        filename: "bild.jpg",
        fileStatus: "FILE_MISSING"
      }),
      false
    );
  });

  it("keeps the legacy preview helper MIME-only", () => {
    assert.equal(
      getDocumentPreviewKind({
        filename: "legacy.pdf"
      }),
      null
    );
  });
});

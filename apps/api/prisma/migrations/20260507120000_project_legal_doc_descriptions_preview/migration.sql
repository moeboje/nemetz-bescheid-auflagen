-- Add long-form project and legal document text fields.
ALTER TABLE "Project" ADD COLUMN "detailedDescription" TEXT;

ALTER TABLE "LegalDocument" ADD COLUMN "detailedDescription" TEXT;
ALTER TABLE "LegalDocument" ADD COLUMN "contentSummary" TEXT;

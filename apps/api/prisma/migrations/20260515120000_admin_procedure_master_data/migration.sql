-- Managed procedure master data for project submission types.
CREATE TABLE "LegalMatter" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "badgeVariant" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalMatter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcedureType" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProcedureType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionType" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "description" TEXT,
  "legalMatterId" TEXT NOT NULL,
  "procedureTypeId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isLegacy" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "badgeVariant" TEXT,
  "legacyAliases" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubmissionType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalMatter_code_key" ON "LegalMatter"("code");
CREATE UNIQUE INDEX "LegalMatter_name_key" ON "LegalMatter"("name");
CREATE INDEX "LegalMatter_isActive_sortOrder_idx" ON "LegalMatter"("isActive", "sortOrder");
CREATE INDEX "LegalMatter_sortOrder_idx" ON "LegalMatter"("sortOrder");

CREATE UNIQUE INDEX "ProcedureType_code_key" ON "ProcedureType"("code");
CREATE UNIQUE INDEX "ProcedureType_name_key" ON "ProcedureType"("name");
CREATE INDEX "ProcedureType_isActive_sortOrder_idx" ON "ProcedureType"("isActive", "sortOrder");
CREATE INDEX "ProcedureType_sortOrder_idx" ON "ProcedureType"("sortOrder");

CREATE UNIQUE INDEX "SubmissionType_code_key" ON "SubmissionType"("code");
CREATE UNIQUE INDEX "SubmissionType_name_key" ON "SubmissionType"("name");
CREATE INDEX "SubmissionType_legalMatterId_idx" ON "SubmissionType"("legalMatterId");
CREATE INDEX "SubmissionType_procedureTypeId_idx" ON "SubmissionType"("procedureTypeId");
CREATE INDEX "SubmissionType_isActive_sortOrder_idx" ON "SubmissionType"("isActive", "sortOrder");
CREATE INDEX "SubmissionType_sortOrder_idx" ON "SubmissionType"("sortOrder");

INSERT INTO "LegalMatter" ("id", "code", "name", "shortName", "description", "isActive", "sortOrder", "badgeVariant", "updatedAt") VALUES
  ('lm-gewerberecht', 'GEWERBERECHT', 'Gewerberecht', 'GewO', 'Gewerberechtliche Verfahren und Betriebsanlagen.', true, 10, 'neutral', CURRENT_TIMESTAMP),
  ('lm-avg', 'AVG', 'AVG', 'AVG', 'Allgemeines Verwaltungsverfahren.', true, 20, 'neutral', CURRENT_TIMESTAMP),
  ('lm-awg', 'AWG', 'AWG', 'AWG', 'Abfallwirtschaftliche Verfahren.', true, 30, 'warning', CURRENT_TIMESTAMP),
  ('lm-uvp', 'UVP', 'UVP', 'UVP', 'Umweltvertraeglichkeitspruefung.', true, 40, 'danger', CURRENT_TIMESTAMP),
  ('lm-wasserrecht', 'WASSERRECHT', 'Wasserrecht', 'WRG', NULL, true, 50, 'neutral', CURRENT_TIMESTAMP),
  ('lm-baurecht', 'BAURECHT', 'Baurecht', NULL, NULL, true, 60, 'neutral', CURRENT_TIMESTAMP),
  ('lm-naturschutzrecht', 'NATURSCHUTZRECHT', 'Naturschutzrecht', NULL, NULL, true, 70, 'neutral', CURRENT_TIMESTAMP),
  ('lm-forstrecht', 'FORSTRECHT', 'Forstrecht', NULL, NULL, true, 80, 'neutral', CURRENT_TIMESTAMP),
  ('lm-arbeitnehmerschutz', 'ARBEITNEHMERSCHUTZ', 'Arbeitnehmerschutz', NULL, NULL, true, 90, 'neutral', CURRENT_TIMESTAMP),
  ('lm-brandschutz', 'BRANDSCHUTZ', 'Brandschutz', NULL, NULL, true, 100, 'warning', CURRENT_TIMESTAMP),
  ('lm-ippc-ied', 'IPPC_IED', 'IPPC/IED', 'IPPC/IED', NULL, true, 110, 'warning', CURRENT_TIMESTAMP),
  ('lm-sonstiges', 'SONSTIGES', 'Sonstiges', NULL, NULL, true, 999, 'neutral', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "ProcedureType" ("id", "code", "name", "shortName", "description", "isActive", "sortOrder", "updatedAt") VALUES
  ('pt-genehmigung', 'GENEHMIGUNG', 'Genehmigung', NULL, NULL, true, 10, CURRENT_TIMESTAMP),
  ('pt-aenderung', 'AENDERUNG', 'Aenderung', NULL, NULL, true, 20, CURRENT_TIMESTAMP),
  ('pt-anzeige', 'ANZEIGE', 'Anzeige', NULL, NULL, true, 30, CURRENT_TIMESTAMP),
  ('pt-feststellung', 'FESTSTELLUNG', 'Feststellung', NULL, NULL, true, 40, CURRENT_TIMESTAMP),
  ('pt-ueberpruefung', 'UEBERPRUEFUNG', 'Ueberpruefung', NULL, NULL, true, 50, CURRENT_TIMESTAMP),
  ('pt-nachkontrolle', 'NACHKONTROLLE', 'Nachkontrolle', NULL, NULL, true, 60, CURRENT_TIMESTAMP),
  ('pt-auflassung', 'AUFLASSUNG', 'Auflassung', NULL, NULL, true, 70, CURRENT_TIMESTAMP),
  ('pt-rechtsmittel', 'RECHTSMITTEL', 'Rechtsmittel', NULL, NULL, true, 80, CURRENT_TIMESTAMP),
  ('pt-wiederverleihung', 'WIEDERVERLEIHUNG', 'Wiederverleihung', NULL, NULL, true, 90, CURRENT_TIMESTAMP),
  ('pt-verlaengerung', 'VERLAENGERUNG', 'Verlaengerung', NULL, NULL, true, 100, CURRENT_TIMESTAMP),
  ('pt-kenntnisnahme', 'KENNTNISNAHME', 'Kenntnisnahme', NULL, NULL, true, 110, CURRENT_TIMESTAMP),
  ('pt-anzeigeverfahren', 'ANZEIGEVERFAHREN', 'Anzeigeverfahren', NULL, NULL, true, 120, CURRENT_TIMESTAMP),
  ('pt-sonstiges', 'SONSTIGES', 'Sonstiges', NULL, NULL, true, 999, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "SubmissionType" ("id", "code", "name", "shortName", "description", "legalMatterId", "procedureTypeId", "isActive", "isLegacy", "sortOrder", "badgeVariant", "legacyAliases", "updatedAt") VALUES
  ('st-gewerbliche-betriebsanlage', 'GEWERBLICHE_BETRIEBSANLAGE', 'Gewerbliche Betriebsanlage', 'GewO', NULL, 'lm-gewerberecht', 'pt-genehmigung', true, false, 10, 'neutral', '["GEWERBE","Gewerbe"]'::jsonb, CURRENT_TIMESTAMP),
  ('st-betriebsanlagenaenderung', 'BETRIEBSANLAGENAENDERUNG', 'Betriebsanlagenaenderung', 'GewO Aenderung', NULL, 'lm-gewerberecht', 'pt-aenderung', true, false, 20, 'neutral', '["Betriebsanlagenaenderung"]'::jsonb, CURRENT_TIMESTAMP),
  ('st-avg-verfahren', 'AVG_VERFAHREN', 'AVG-Verfahren', 'AVG', NULL, 'lm-avg', 'pt-genehmigung', true, false, 25, 'neutral', '["AVG"]'::jsonb, CURRENT_TIMESTAMP),
  ('st-awg-behandlungsanlage', 'AWG_BEHANDLUNGSANLAGE', 'AWG-Behandlungsanlage', 'AWG', NULL, 'lm-awg', 'pt-genehmigung', true, false, 30, 'warning', '["AWG"]'::jsonb, CURRENT_TIMESTAMP),
  ('st-awg-sammlung-behandlung', 'AWG_SAMMLUNG_BEHANDLUNG', 'AWG-Sammlung/Behandlung', 'AWG Sammlung', NULL, 'lm-awg', 'pt-genehmigung', true, false, 40, 'warning', '["AWG-Sammlung/Behandlung"]'::jsonb, CURRENT_TIMESTAMP),
  ('st-uvp-feststellung', 'UVP_FESTSTELLUNG', 'UVP-Feststellung', 'UVP Feststellung', NULL, 'lm-uvp', 'pt-feststellung', true, false, 50, 'danger', '["UVP"]'::jsonb, CURRENT_TIMESTAMP),
  ('st-uvp-genehmigung', 'UVP_GENEHMIGUNG', 'UVP-Genehmigung', 'UVP', NULL, 'lm-uvp', 'pt-genehmigung', true, false, 60, 'danger', '["UVP_UVE","UVP/UVE"]'::jsonb, CURRENT_TIMESTAMP),
  ('st-wasserrechtliche-bewilligung', 'WASSERRECHTLICHE_BEWILLIGUNG', 'Wasserrechtliche Bewilligung', 'WRG', NULL, 'lm-wasserrecht', 'pt-genehmigung', true, false, 70, 'neutral', '["wasserrechtliche Bewilligung"]'::jsonb, CURRENT_TIMESTAMP),
  ('st-behoerdliche-anzeige', 'BEHOERDLICHE_ANZEIGE', 'Behoerdliche Anzeige', 'Anzeige', NULL, 'lm-avg', 'pt-anzeige', true, false, 90, 'neutral', '["Anzeige"]'::jsonb, CURRENT_TIMESTAMP),
  ('st-sonstiges-verfahren', 'SONSTIGES_VERFAHREN', 'Sonstiges Verfahren', 'Sonstiges', NULL, 'lm-sonstiges', 'pt-sonstiges', true, false, 999, 'neutral', '["Sonstige","SONSTIGES"]'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "Project" ADD COLUMN "submissionTypeId" TEXT;

UPDATE "Project"
SET "submissionTypeId" = CASE "submissionType"
  WHEN 'GEWERBE'::"ProjectSubmissionType" THEN 'st-gewerbliche-betriebsanlage'
  WHEN 'AWG'::"ProjectSubmissionType" THEN 'st-awg-behandlungsanlage'
  WHEN 'UVP_UVE'::"ProjectSubmissionType" THEN 'st-uvp-genehmigung'
  ELSE NULL
END
WHERE "submissionType" IS NOT NULL AND "submissionTypeId" IS NULL;

CREATE INDEX "Project_submissionTypeId_idx" ON "Project"("submissionTypeId");

ALTER TABLE "SubmissionType" ADD CONSTRAINT "SubmissionType_legalMatterId_fkey" FOREIGN KEY ("legalMatterId") REFERENCES "LegalMatter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionType" ADD CONSTRAINT "SubmissionType_procedureTypeId_fkey" FOREIGN KEY ("procedureTypeId") REFERENCES "ProcedureType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_submissionTypeId_fkey" FOREIGN KEY ("submissionTypeId") REFERENCES "SubmissionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

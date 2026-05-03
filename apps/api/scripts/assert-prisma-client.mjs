#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_OBLIGATION_FIELDS = [
  "recurrenceEndDate",
  "externalOrgId",
  "externalUserId"
];
const REQUIRED_MODEL_FIELDS = {
  Obligation: REQUIRED_OBLIGATION_FIELDS,
  ProjectAccess: ["projectId", "userId", "accessRole", "grantedByUserId"],
  LegacyDecision: ["projectId", "title", "legacyStatus", "reviewStatus", "linkedLegalDocId"],
  BrandingAsset: ["type", "fileName", "mimeType", "sizeBytes", "content", "sha256", "updatedById"]
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDir, "..");
const generatedSchemaPath = path.join(apiRoot, "node_modules", ".prisma", "client", "schema.prisma");
const generatedClientPath = path.join(apiRoot, "node_modules", ".prisma", "client", "index.js");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function getModelBlock(schema, modelName) {
  const match = schema.match(new RegExp(`model\\s+${modelName}\\s+\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

function findMissingGeneratedSchemaFields() {
  if (!existsSync(generatedSchemaPath)) {
    fail(
      `Generated Prisma schema was not found at ${generatedSchemaPath}. Run npm run prisma:generate in apps/api.`
    );
  }

  const generatedSchema = readFileSync(generatedSchemaPath, "utf8");
  return Object.entries(REQUIRED_MODEL_FIELDS).flatMap(([modelName, fieldNames]) => {
    const modelBlock = getModelBlock(generatedSchema, modelName);
    if (!modelBlock) {
      fail(
        `Generated Prisma schema is stale: model ${modelName} was not found. Run npm run prisma:generate in apps/api.`
      );
    }

    return fieldNames
      .filter((fieldName) => !new RegExp(`^\\s+${fieldName}\\b`, "m").test(modelBlock))
      .map((fieldName) => `${modelName}.${fieldName}`);
  });
}

function findMissingDmmfFields() {
  if (!existsSync(generatedClientPath)) {
    fail(
      `Generated Prisma client was not found at ${generatedClientPath}. Run npm run prisma:generate in apps/api.`
    );
  }

  const require = createRequire(import.meta.url);
  const { Prisma } = require(generatedClientPath);
  return Object.entries(REQUIRED_MODEL_FIELDS).flatMap(([modelName, requiredFieldNames]) => {
    const model = Prisma.dmmf.datamodel.models.find((entry) => entry.name === modelName);
    const fieldNames = new Set(model?.fields.map((field) => field.name) ?? []);

    return requiredFieldNames
      .filter((fieldName) => !fieldNames.has(fieldName))
      .map((fieldName) => `${modelName}.${fieldName}`);
  });
}

const missingSchemaFields = findMissingGeneratedSchemaFields();
const missingDmmfFields = findMissingDmmfFields();
const missing = Array.from(new Set([...missingSchemaFields, ...missingDmmfFields]));

if (missing.length > 0) {
  fail(
    `Generated Prisma Client is stale: missing ${missing.join(
      ", "
    )}. Run npm run prisma:generate in apps/api.`
  );
}

import { loadProjectEnvFile, resolveDatabaseUrl } from "./config.js";

type PrismaDmmf = {
  dmmf: {
    datamodel: {
      models: ReadonlyArray<{
        name: string;
        fields: ReadonlyArray<{ name: string }>;
      }>;
    };
  };
};

const REQUIRED_OBLIGATION_FIELDS = [
  "recurrenceEndDate",
  "externalOrgId",
  "externalUserId"
];

function assertPrismaClientFields(prismaDmmf: PrismaDmmf) {
  const requiredModelFields = {
    Obligation: REQUIRED_OBLIGATION_FIELDS,
    BrandingAsset: ["type", "fileName", "mimeType", "sizeBytes", "content", "sha256", "updatedById"]
  };

  const missing = Object.entries(requiredModelFields).flatMap(([modelName, requiredFieldNames]) => {
    const model = prismaDmmf.dmmf.datamodel.models.find((entry) => entry.name === modelName);
    const fieldNames = new Set(model?.fields.map((field) => field.name) ?? []);
    return requiredFieldNames
      .filter((fieldName) => !fieldNames.has(fieldName))
      .map((fieldName) => `${modelName}.${fieldName}`);
  });

  if (missing.length > 0) {
    throw new Error(
      `Generated Prisma Client is stale: missing ${missing.join(
        ", "
      )}. Run npm run prisma:generate in apps/api.`
    );
  }
}

loadProjectEnvFile();
process.env.DATABASE_URL = resolveDatabaseUrl(process.env);

const { Prisma, PrismaClient } = await import("@prisma/client");
assertPrismaClientFields(Prisma);

export const prisma = new PrismaClient();

export async function disconnectPrisma() {
  await prisma.$disconnect();
}

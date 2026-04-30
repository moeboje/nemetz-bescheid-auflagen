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
  const obligationModel = prismaDmmf.dmmf.datamodel.models.find(
    (model) => model.name === "Obligation"
  );
  const fieldNames = new Set(obligationModel?.fields.map((field) => field.name) ?? []);
  const missing = REQUIRED_OBLIGATION_FIELDS.filter((fieldName) => !fieldNames.has(fieldName));

  if (missing.length > 0) {
    throw new Error(
      `Generated Prisma Client is stale: Obligation is missing ${missing.join(
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

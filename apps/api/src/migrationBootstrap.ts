import { prisma } from "./prisma.js";
import { loadProjectEnvFile } from "./config.js";

const expectedAppTables = [
  "User",
  "Document",
  "Comment",
  "CommentRevision",
  "Role",
  "ExternalOrganization",
  "Company",
  "Site",
  "Facility",
  "Authority",
  "AuthorityContact",
  "Project",
  "ProjectChecklist",
  "ProjectChecklistSection",
  "ProjectChecklistItem",
  "LegalDocument",
  "Obligation",
  "Deadline",
  "TaskStateEntry",
  "MfaPending",
  "MfaChallenge",
  "Session",
  "PasswordResetToken",
  "AuditLog",
  "PortalSnapshot"
] as const;

type BootstrapMode = "fresh" | "ready" | "baseline" | "partial";

type TableRow = {
  tableName: string;
};

async function detectMigrationBootstrapMode(): Promise<BootstrapMode> {
  const migrationTableRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = '_prisma_migrations'
    ) AS "exists"
  `;

  const migrationTableExists = migrationTableRows[0]?.exists === true;
  let appliedMigrationCount = 0;

  if (migrationTableExists) {
    const countRows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "_prisma_migrations"
    `;
    appliedMigrationCount = countRows[0]?.count ?? 0;
  }

  if (appliedMigrationCount > 0) {
    return "ready";
  }

  const tableRows = await prisma.$queryRaw<TableRow[]>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
  `;

  const presentTables = new Set(tableRows.map((row) => row.tableName));
  if (presentTables.size === 0) {
    return "fresh";
  }

  const allExpectedTablesPresent = expectedAppTables.every((tableName) => presentTables.has(tableName));
  return allExpectedTablesPresent ? "baseline" : "partial";
}

async function run() {
  loadProjectEnvFile();
  const mode = await detectMigrationBootstrapMode();
  process.stdout.write(mode);
}

run()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
    }
    process.exit(1);
  });

import { prisma } from "./prisma.js";
import { hashPassword, validatePassword } from "./security.js";
import { loadProjectEnvFile } from "./config.js";

type SeedUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: "ADMIN" | "COMPLIANCE" | "USER" | "EXTERNAL";
  type: "INTERNAL" | "EXTERNAL";
  externalOrgName?: string;
};

async function run() {
  loadProjectEnvFile();
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const sharedPassword = process.env.SEED_DEFAULT_PASSWORD || adminPassword;

  const passwordValidation = validatePassword(adminPassword);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message || "Invalid ADMIN_PASSWORD");
  }

  const sharedPasswordValidation = validatePassword(sharedPassword);
  if (!sharedPasswordValidation.valid) {
    throw new Error(sharedPasswordValidation.message || "Invalid SEED_DEFAULT_PASSWORD");
  }

  const adminHash = await hashPassword(adminPassword);
  const defaultHash = await hashPassword(sharedPassword);

  const now = new Date();
  const seedRoles = [
    {
      key: "ADMIN",
      labelDe: "Admin"
    },
    {
      key: "COMPLIANCE",
      labelDe: "Compliance"
    },
    {
      key: "USER",
      labelDe: "Benutzer"
    },
    {
      key: "EXTERNAL",
      labelDe: "Extern"
    }
  ] as const;

  for (const role of seedRoles) {
    await prisma.role.upsert({
      where: {
        key: role.key
      },
      update: {
        labelDe: role.labelDe,
        isSystem: true,
        isArchived: false
      },
      create: {
        key: role.key,
        labelDe: role.labelDe,
        isSystem: true,
        isArchived: false
      }
    });
  }

  const seedExternalOrganizations = [
    {
      name: "Musterkanzlei Partner OG",
      type: "Kanzlei",
      phone: "+43 800 200 301",
      email: "office@musterkanzlei.test"
    },
    {
      name: "Ingenieurbuero Nord GmbH",
      type: "Technisches Buero",
      phone: "+43 800 200 302",
      email: "team@ingenieurbuero-nord.test"
    },
    {
      name: "Sachverstaendigenbuero West",
      type: "Gutachter",
      phone: "+43 800 200 303",
      email: "kontakt@sachverstaendigenbuero-west.test"
    }
  ] as const;

  const externalOrgByName = new Map<string, string>();
  for (const organization of seedExternalOrganizations) {
    const upserted = await prisma.externalOrganization.upsert({
      where: {
        name: organization.name
      },
      update: {
        type: organization.type,
        phone: organization.phone,
        email: organization.email,
        isArchived: false
      },
      create: {
        name: organization.name,
        type: organization.type,
        phone: organization.phone,
        email: organization.email
      }
    });
    externalOrgByName.set(upserted.name, upserted.id);
  }

  const seedUsers: SeedUser[] = [
    {
      id: "u-001",
      firstName: "Max",
      lastName: "Mustermann",
      email: adminEmail,
      phone: "+43 800 100 101",
      role: "ADMIN",
      type: "INTERNAL"
    },
    {
      id: "u-002",
      firstName: "Erika",
      lastName: "Muster",
      email: "erika.demo@example.com",
      phone: "+43 800 100 102",
      role: "COMPLIANCE",
      type: "INTERNAL"
    },
    {
      id: "u-003",
      firstName: "Paul",
      lastName: "Beispiel",
      email: "paul.demo@example.com",
      phone: "+43 800 100 103",
      role: "USER",
      type: "INTERNAL"
    },
    {
      id: "u-004",
      firstName: "Nina",
      lastName: "Demo",
      email: "nina.demo@example.com",
      phone: "+43 800 100 104",
      role: "USER",
      type: "INTERNAL"
    },
    {
      id: "u-005",
      firstName: "Tobias",
      lastName: "Test",
      email: "tobias.demo@example.com",
      phone: "+43 800 100 105",
      role: "USER",
      type: "INTERNAL"
    },
    {
      id: "u-006",
      firstName: "Sabine",
      lastName: "Musterfrau",
      email: "sabine.demo@example.com",
      phone: "+43 800 100 106",
      role: "USER",
      type: "INTERNAL"
    },
    {
      id: "u-007",
      firstName: "Alex",
      lastName: "Extern",
      email: "alex.demo@invalid.local",
      phone: "+43 800 100 201",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgName: "Ingenieurbuero Nord GmbH"
    },
    {
      id: "u-008",
      firstName: "Chris",
      lastName: "Partner",
      email: "chris.demo@invalid.local",
      phone: "+43 800 100 202",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgName: "Musterkanzlei Partner OG"
    },
    {
      id: "u-009",
      firstName: "Jamie",
      lastName: "Dienstleister",
      email: "jamie.demo@invalid.local",
      phone: "+43 800 100 203",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgName: "Sachverstaendigenbuero West"
    }
  ];

  for (const row of seedUsers) {
    const externalOrgId = row.externalOrgName ? externalOrgByName.get(row.externalOrgName) ?? null : null;

    const duplicateByEmail = await prisma.user.findUnique({
      where: {
        email: row.email
      }
    });

    if (duplicateByEmail && duplicateByEmail.id !== row.id) {
      await prisma.$transaction([
        prisma.session.deleteMany({ where: { userId: duplicateByEmail.id } }),
        prisma.passwordResetToken.deleteMany({ where: { userId: duplicateByEmail.id } }),
        prisma.auditLog.deleteMany({
          where: {
            OR: [{ actorUserId: duplicateByEmail.id }, { targetUserId: duplicateByEmail.id }]
          }
        }),
        prisma.user.delete({ where: { id: duplicateByEmail.id } })
      ]);
    }

    await prisma.user.upsert({
      where: {
        id: row.id
      },
      update: {
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        role: row.role,
        type: row.type,
        isArchived: false,
        passwordHash: row.role === "ADMIN" ? adminHash : defaultHash,
        passwordUpdatedAt: now,
        externalOrgId,
        externalCompany: row.type === "EXTERNAL" ? row.externalOrgName ?? null : null,
        failedLoginCount: 0,
        lockedUntil: null
      },
      create: {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        role: row.role,
        type: row.type,
        isArchived: false,
        passwordHash: row.role === "ADMIN" ? adminHash : defaultHash,
        externalOrgId,
        externalCompany: row.type === "EXTERNAL" ? row.externalOrgName ?? null : null,
        passwordUpdatedAt: now
      }
    });
  }
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

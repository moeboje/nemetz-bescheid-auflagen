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

const domainSeedTimestamp = new Date("2026-02-01T09:00:00.000Z");

const seedCompanies = [
  {
    id: "c-001",
    name: "Nemetz AG",
    shortName: ""
  },
  {
    id: "c-002",
    name: "Nemetz Muehlendorf GmbH",
    shortName: ""
  }
] as const;

const seedSites = [
  {
    id: "s-001",
    companyId: "c-001",
    name: "Wien 1150"
  },
  {
    id: "s-002",
    companyId: "c-001",
    name: "Leopoldsdorf"
  },
  {
    id: "s-003",
    companyId: "c-002",
    name: "Muehlendorf"
  }
] as const;

const seedFacilities = [
  {
    id: "f-001",
    companyId: "c-001",
    siteId: "s-002",
    name: "Sortieranlage Leopoldsdorf",
    type: ""
  },
  {
    id: "f-002",
    companyId: "c-001",
    siteId: "s-002",
    name: "Umladestation",
    type: ""
  },
  {
    id: "f-005",
    companyId: "c-002",
    siteId: "s-003",
    name: "Zwischenlager",
    type: ""
  },
  {
    id: "f-006",
    companyId: "c-002",
    siteId: "s-003",
    name: "Containerplatz",
    type: ""
  }
] as const;

const seedAuthorities = [
  {
    id: "auth-001",
    name: "Bezirkshauptmannschaft",
    shortName: "BH"
  },
  {
    id: "auth-002",
    name: "Magistrat",
    shortName: "MAG"
  },
  {
    id: "auth-003",
    name: "Landesregierung (Umwelt)",
    shortName: "LRU"
  }
] as const;

const seedAuthorityContacts: Array<{
  id: string;
  authorityId: string;
  name: string;
  email?: string;
  phone?: string;
  roleTitle?: string;
}> = [];

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

  for (const company of seedCompanies) {
    await prisma.$executeRaw`
      INSERT INTO "Company" ("id", "name", "shortName", "isArchived", "createdAt", "updatedAt")
      VALUES (${company.id}, ${company.name}, ${company.shortName || null}, ${false}, ${domainSeedTimestamp}, ${domainSeedTimestamp})
      ON CONFLICT ("id") DO UPDATE
      SET "name" = EXCLUDED."name",
          "shortName" = EXCLUDED."shortName",
          "isArchived" = EXCLUDED."isArchived",
          "updatedAt" = EXCLUDED."updatedAt"
    `;
  }

  for (const site of seedSites) {
    await prisma.$executeRaw`
      INSERT INTO "Site" ("id", "companyId", "name", "isArchived", "createdAt", "updatedAt")
      VALUES (${site.id}, ${site.companyId}, ${site.name}, ${false}, ${domainSeedTimestamp}, ${domainSeedTimestamp})
      ON CONFLICT ("id") DO UPDATE
      SET "companyId" = EXCLUDED."companyId",
          "name" = EXCLUDED."name",
          "isArchived" = EXCLUDED."isArchived",
          "updatedAt" = EXCLUDED."updatedAt"
    `;
  }

  for (const facility of seedFacilities) {
    await prisma.$executeRaw`
      INSERT INTO "Facility" ("id", "companyId", "siteId", "name", "type", "isArchived", "createdAt", "updatedAt")
      VALUES (${facility.id}, ${facility.companyId}, ${facility.siteId}, ${facility.name}, ${facility.type || null}, ${false}, ${domainSeedTimestamp}, ${domainSeedTimestamp})
      ON CONFLICT ("id") DO UPDATE
      SET "companyId" = EXCLUDED."companyId",
          "siteId" = EXCLUDED."siteId",
          "name" = EXCLUDED."name",
          "type" = EXCLUDED."type",
          "isArchived" = EXCLUDED."isArchived",
          "updatedAt" = EXCLUDED."updatedAt"
    `;
  }

  for (const authority of seedAuthorities) {
    await prisma.$executeRaw`
      INSERT INTO "Authority" ("id", "name", "shortName", "isArchived", "createdAt", "updatedAt")
      VALUES (${authority.id}, ${authority.name}, ${authority.shortName || null}, ${false}, ${domainSeedTimestamp}, ${domainSeedTimestamp})
      ON CONFLICT ("id") DO UPDATE
      SET "name" = EXCLUDED."name",
          "shortName" = EXCLUDED."shortName",
          "isArchived" = EXCLUDED."isArchived",
          "updatedAt" = EXCLUDED."updatedAt"
    `;
  }

  for (const contact of seedAuthorityContacts) {
    await prisma.$executeRaw`
      INSERT INTO "AuthorityContact" ("id", "authorityId", "name", "email", "phone", "roleTitle", "isArchived", "createdAt", "updatedAt")
      VALUES (${contact.id}, ${contact.authorityId}, ${contact.name}, ${contact.email || null}, ${contact.phone || null}, ${contact.roleTitle || null}, ${false}, ${domainSeedTimestamp}, ${domainSeedTimestamp})
      ON CONFLICT ("id") DO UPDATE
      SET "authorityId" = EXCLUDED."authorityId",
          "name" = EXCLUDED."name",
          "email" = EXCLUDED."email",
          "phone" = EXCLUDED."phone",
          "roleTitle" = EXCLUDED."roleTitle",
          "isArchived" = EXCLUDED."isArchived",
          "updatedAt" = EXCLUDED."updatedAt"
    `;
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

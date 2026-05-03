import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { resolveDatabaseUrl, type AppConfig } from "./config.js";
import { prisma } from "./prisma.js";
import { hashPassword } from "./security.js";

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let requestCounter = 0;

async function request(pathname: string, options: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  requestCounter += 1;
  headers["X-Forwarded-For"] = `127.0.0.${(requestCounter % 200) + 1}`;

  if (options.cookie) {
    headers.Cookie = options.cookie;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
}

function extractSessionCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return "";
  }

  const match = setCookieHeader.match(/nemetz_session=[^;]+/);
  return match ? match[0] : "";
}

async function createUser(args: {
  email: string;
  password: string;
  role?: string;
  type?: "INTERNAL" | "EXTERNAL";
  externalOrgId?: string;
  isArchived?: boolean;
}) {
  return prisma.user.create({
    data: {
      firstName: "Project",
      lastName: "Tester",
      email: args.email,
      role: args.role ?? "USER",
      type: args.type ?? "INTERNAL",
      externalOrgId: args.externalOrgId,
      isArchived: args.isArchived ?? false,
      passwordHash: await hashPassword(args.password)
    }
  });
}

async function createRole(key: string, permissionKeys: string[]) {
  return prisma.role.create({
    data: {
      key,
      labelDe: key,
      isSystem: false,
      permissionsJson: permissionKeys
    }
  });
}

async function login(email: string, password: string) {
  const response = await request("/auth/login", {
    method: "POST",
    body: {
      email,
      password
    }
  });

  assert.equal(response.status, 200);
  const cookie = extractSessionCookie(response.headers.get("set-cookie"));
  assert.ok(cookie, "Expected session cookie");
  return cookie;
}

async function createCompany(name: string) {
  return prisma.company.create({
    data: {
      name
    }
  });
}

describe("Projects submission type", () => {
  before(async () => {
    const config: AppConfig = {
      port: 0,
      databaseUrl: resolveDatabaseUrl(process.env, "test"),
      appOrigin: "http://localhost:5173",
      notificationBaseUrl: "http://localhost:5173",
      legacyRecoveryEndpointsEnabled: true,
      notificationDispatchEnabled: false,
      notificationDryRun: true,
      notificationFromLabel: "Nemetz Portal",
      powerAutomateNotificationWebhookUrl: "",
      powerAutomateNotificationSecret: "",
      notificationMaxAttempts: 5,
      notificationDispatchBatchSize: 25,
      notificationDispatchTimeoutMs: 15_000,
      notificationClaimLeaseSeconds: 300,
      notificationTimeZone: "Europe/Vienna",
      sessionSecret: "test-secret",
      nodeEnv: "test",
      resetTokenTtlMinutes: 30,
      sessionTtlDays: 7,
      cookieSecure: false,
      basePath: "/api",
      authEnableEntra: false,
      entraTenantId: "",
      entraClientId: "",
      entraClientSecret: "",
      entraRedirectUri: "http://localhost:4000/api/auth/entra/callback",
      entraAllowedDomains: ["nemetz-ag.at"],
      entraAutoProvision: false,
      entraScopes: ["openid", "profile", "email"],
      documentsStorageDir: "storage",
      documentsMaxUploadBytes: 20 * 1024 * 1024
    };

    const app = createApp(config);
    server = app.listen(0);
    await once(server, "listening");

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  });

  after(async () => {
    server.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.deadline.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.legalDocument.deleteMany();
    await prisma.taskStateEntry.deleteMany();
    await prisma.project.deleteMany();
    await prisma.authorityContact.deleteMany();
    await prisma.authority.deleteMany();
    await prisma.facility.deleteMany();
    await prisma.site.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.externalOrganization.deleteMany();
    await prisma.role.deleteMany();
  });

  it("keeps submissionType unset when not provided", async () => {
    const user = await createUser({
      email: "project-unset@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Unset Company");
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt ohne Einreichtyp",
        companyId: company.id
      }
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as {
      project: {
        submissionType?: string;
      };
    };

    assert.equal(payload.project.submissionType, undefined);
  });

  it("persists a selected submissionType and allows changing it", async () => {
    const user = await createUser({
      email: "project-submission-type@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Submission Type Company");
    const cookie = await login(user.email, "ValidPassword1!");

    const createResponse = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit Einreichtyp",
        companyId: company.id,
        submissionType: "AWG"
      }
    });
    assert.equal(createResponse.status, 201);
    const createdPayload = (await createResponse.json()) as {
      project: { id: string; submissionType?: string };
    };
    assert.equal(createdPayload.project.submissionType, "AWG");

    const storedCreated = await prisma.project.findUniqueOrThrow({
      where: {
        id: createdPayload.project.id
      },
      select: {
        submissionType: true
      }
    });
    assert.equal(storedCreated.submissionType, "AWG");

    const updateResponse = await request(`/projects/${createdPayload.project.id}`, {
      method: "PATCH",
      cookie,
      body: {
        submissionType: "UVP_UVE"
      }
    });

    assert.equal(updateResponse.status, 200);
    const updatedPayload = (await updateResponse.json()) as {
      project: {
        submissionType?: string;
      };
    };

    assert.equal(updatedPayload.project.submissionType, "UVP_UVE");

    const storedUpdated = await prisma.project.findUniqueOrThrow({
      where: {
        id: createdPayload.project.id
      },
      select: {
        submissionType: true
      }
    });
    assert.equal(storedUpdated.submissionType, "UVP_UVE");
  });

  it("accepts active internal users for project owner and internal participants", async () => {
    const admin = await createUser({
      email: "project-internal-owner-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const owner = await createUser({
      email: "project-internal-owner@example.com",
      password: "ValidPassword1!"
    });
    const participant = await createUser({
      email: "project-internal-participant@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Internal Project Roles Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit internen Rollen",
        companyId: company.id,
        ownerUserId: owner.id,
        internalParticipants: [{ userId: participant.id }],
        participantUserIds: [participant.id]
      }
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as {
      project: {
        ownerUserId?: string;
        participantUserIds: string[];
      };
    };
    assert.equal(payload.project.ownerUserId, owner.id);
    assert.deepEqual(payload.project.participantUserIds, [participant.id]);
  });

  it("rejects an external user as project owner", async () => {
    const admin = await createUser({
      email: "project-external-owner-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "External Owner Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await createUser({
      email: "project-external-owner@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const company = await createCompany("External Owner Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit externem Owner",
        companyId: company.id,
        ownerUserId: externalUser.id
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Owner user must be an active internal user.");
  });

  it("rejects an external user as project deputy", async () => {
    const admin = await createUser({
      email: "project-external-deputy-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "External Deputy Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await createUser({
      email: "project-external-deputy@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const company = await createCompany("External Deputy Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit externer Stellvertretung",
        companyId: company.id,
        deputyUserId: externalUser.id
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Deputy user must be an active internal user.");
  });

  it("rejects archived users as project owner", async () => {
    const admin = await createUser({
      email: "project-archived-owner-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const archivedOwner = await createUser({
      email: "project-archived-owner@example.com",
      password: "ValidPassword1!",
      isArchived: true
    });
    const company = await createCompany("Archived Owner Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit archiviertem Owner",
        companyId: company.id,
        ownerUserId: archivedOwner.id
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Owner user must be an active internal user.");
  });

  it("rejects external users in internal project participants", async () => {
    const admin = await createUser({
      email: "project-external-participant-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "External Internal Participant Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await createUser({
      email: "project-external-internal-participant@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const company = await createCompany("External Internal Participant Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit externem internem Teilnehmer",
        companyId: company.id,
        internalParticipants: [{ userId: externalUser.id }],
        participantUserIds: [externalUser.id]
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Internal project participants must be active internal users.");
  });

  it("accepts external users through externalParticipants", async () => {
    const admin = await createUser({
      email: "project-external-participants-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "External Participants Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await createUser({
      email: "project-external-participant@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const company = await createCompany("External Participants Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit externen Teilnehmern",
        companyId: company.id,
        externalParticipants: [
          {
            id: "ep-test-1",
            type: "SERVICE_PROVIDER",
            externalUserId: externalUser.id,
            name: "Externer Teilnehmer",
            isArchived: false
          }
        ]
      }
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as {
      project: {
        externalParticipants: Array<{
          externalOrgId?: string;
          externalUserId?: string;
        }>;
      };
    };
    assert.equal(payload.project.externalParticipants[0]?.externalUserId, externalUser.id);
    assert.equal(payload.project.externalParticipants[0]?.externalOrgId, externalOrg.id);
  });

  it("rejects invalid submissionType values", async () => {
    const user = await createUser({
      email: "project-invalid-submission-type@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Invalid Submission Type Company");
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit ungueltigem Einreichtyp",
        companyId: company.id,
        submissionType: "INVALID"
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(
      payload.message,
      "Invalid project submission type. Allowed values: GEWERBE, AWG, UVP_UVE."
    );
  });

  it("blocks legal document bulk replace while downstream obligations exist", async () => {
    const user = await createUser({
      email: "legal-doc-bulk-downstream@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const company = await createCompany("LegalDoc Downstream Company");
    const project = await prisma.project.create({
      data: {
        id: "project-legal-doc-downstream",
        title: "Projekt mit Rechtsdokument",
        companyId: company.id,
        participantUserIds: [],
        internalParticipants: [],
        externalParticipants: [],
        attachments: [],
        dependsOnProjectIds: [],
        referenceLegalDocIds: []
      }
    });
    const legalDoc = await prisma.legalDocument.create({
      data: {
        id: "legal-doc-with-obligation",
        projectId: project.id,
        type: "NOTICE",
        title: "Bescheid mit Auflage",
        attachments: []
      }
    });
    await prisma.obligation.create({
      data: {
        id: "obligation-downstream",
        legalDocId: legalDoc.id,
        title: "Bestehende Auflage",
        level: "MANDATORY",
        scheduleType: "ONCE",
        emailReminderEnabled: false,
        evidenceRequirements: {}
      }
    });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/admin/internal/legal-docs/bulk-replace", {
      method: "PUT",
      cookie,
      body: []
    });

    assert.equal(response.status, 409);
    assert.equal(await prisma.legalDocument.count(), 1);
    assert.equal(await prisma.obligation.count(), 1);
  });

  it("blocks legal document bulk delete while linked deadlines exist", async () => {
    const user = await createUser({
      email: "legal-doc-bulk-delete-deadline@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const company = await createCompany("LegalDoc Deadline Company");
    const project = await prisma.project.create({
      data: {
        id: "project-legal-doc-deadline",
        title: "Projekt mit verlinkter Frist",
        companyId: company.id,
        participantUserIds: [],
        internalParticipants: [],
        externalParticipants: [],
        attachments: [],
        dependsOnProjectIds: [],
        referenceLegalDocIds: []
      }
    });
    const legalDoc = await prisma.legalDocument.create({
      data: {
        id: "legal-doc-with-deadline",
        projectId: project.id,
        type: "NOTICE",
        title: "Bescheid mit Frist",
        attachments: []
      }
    });
    await prisma.deadline.create({
      data: {
        id: "deadline-linked-to-legal-doc",
        title: "Verlinkte Frist",
        dueDate: "2026-05-01",
        status: "OPEN",
        projectId: project.id,
        legalDocId: legalDoc.id,
        emailReminderEnabled: false,
        evidence: []
      }
    });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/admin/internal/legal-docs/bulk-delete", {
      method: "DELETE",
      cookie
    });

    assert.equal(response.status, 409);
    assert.equal(await prisma.legalDocument.count(), 1);
    assert.equal(await prisma.deadline.count({ where: { legalDocId: legalDoc.id } }), 1);
  });

  it("scopes project lists and details by explicit ProjectAccess", async () => {
    await createRole("PROJECT_SCOPE_ADMIN_ONLY", ["admin.access"]);
    await createRole("PROJECT_SCOPE_USER_ADMIN", ["admin.access", "users.manage"]);
    await createRole("PROJECT_SCOPE_LEGAL_DOC_ONLY", ["legalDocs.view"]);
    await createRole("PROJECT_SCOPE_VIEW_ALL", ["projects.viewAll"]);
    await createRole("PROJECT_SCOPE_GLOBAL_EDITOR", ["projects.viewAll", "projects.edit"]);

    const admin = await createUser({
      email: "project-access-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const adminAccessOnly = await createUser({
      email: "project-access-admin-only@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_SCOPE_ADMIN_ONLY"
    });
    const userAdmin = await createUser({
      email: "project-access-user-admin-scope@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_SCOPE_USER_ADMIN"
    });
    const legalDocOnlyUser = await createUser({
      email: "project-access-legal-doc-only@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_SCOPE_LEGAL_DOC_ONLY"
    });
    const viewAllUser = await createUser({
      email: "project-access-view-all@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_SCOPE_VIEW_ALL"
    });
    const globalEditor = await createUser({
      email: "project-access-global-editor@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_SCOPE_GLOBAL_EDITOR"
    });
    const internalUser = await createUser({
      email: "project-access-internal@example.com",
      password: "ValidPassword1!"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "Project Access External Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await createUser({
      email: "project-access-external@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const company = await createCompany("Project Access Company");
    const firstProject = await prisma.project.create({
      data: {
        id: "project-access-visible",
        title: "Visible Project",
        companyId: company.id,
        participantUserIds: [],
        internalParticipants: [],
        externalParticipants: [],
        attachments: [],
        dependsOnProjectIds: [],
        referenceLegalDocIds: []
      }
    });
    const secondProject = await prisma.project.create({
      data: {
        id: "project-access-hidden",
        title: "Hidden Project",
        companyId: company.id,
        participantUserIds: [],
        internalParticipants: [],
        externalParticipants: [],
        attachments: [],
        dependsOnProjectIds: [],
        referenceLegalDocIds: []
      }
    });
    const visibleLegalDoc = await prisma.legalDocument.create({
      data: {
        id: "project-access-visible-legal-doc",
        projectId: firstProject.id,
        type: "NOTICE",
        title: "Visible Legal Doc Through Domain Scope",
        attachments: []
      }
    });
    await prisma.projectAccess.createMany({
      data: [
        {
          projectId: firstProject.id,
          userId: userAdmin.id,
          accessRole: "PROJECT_VIEWER"
        },
        {
          projectId: firstProject.id,
          userId: legalDocOnlyUser.id,
          accessRole: "PROJECT_VIEWER"
        }
      ]
    });

    const adminCookie = await login(admin.email, "ValidPassword1!");
    const adminAccessOnlyCookie = await login(adminAccessOnly.email, "ValidPassword1!");
    const userAdminCookie = await login(userAdmin.email, "ValidPassword1!");
    const legalDocOnlyCookie = await login(legalDocOnlyUser.email, "ValidPassword1!");
    const viewAllCookie = await login(viewAllUser.email, "ValidPassword1!");
    const globalEditorCookie = await login(globalEditor.email, "ValidPassword1!");
    const internalCookie = await login(internalUser.email, "ValidPassword1!");
    const externalCookie = await login(externalUser.email, "ValidPassword1!");

    const adminList = await request("/projects", { cookie: adminCookie });
    assert.equal(adminList.status, 200);
    const adminProjects = (await adminList.json()) as Array<{ id: string }>;
    assert.deepEqual(
      adminProjects.map((project) => project.id).sort(),
      [firstProject.id, secondProject.id].sort()
    );

    const adminAccessOnlyList = await request("/projects", { cookie: adminAccessOnlyCookie });
    assert.equal(adminAccessOnlyList.status, 200);
    assert.deepEqual(await adminAccessOnlyList.json(), []);
    const adminAccessOnlyDetail = await request(`/projects/${firstProject.id}`, { cookie: adminAccessOnlyCookie });
    assert.equal(adminAccessOnlyDetail.status, 403);

    const userAdminList = await request("/projects", { cookie: userAdminCookie });
    assert.equal(userAdminList.status, 200);
    assert.deepEqual(await userAdminList.json(), []);
    const userAdminDetail = await request(`/projects/${firstProject.id}`, { cookie: userAdminCookie });
    assert.equal(userAdminDetail.status, 403);

    const legalDocOnlyProjectList = await request("/projects", { cookie: legalDocOnlyCookie });
    assert.equal(legalDocOnlyProjectList.status, 200);
    assert.deepEqual(await legalDocOnlyProjectList.json(), []);
    const legalDocOnlyProjectDetail = await request(`/projects/${firstProject.id}`, { cookie: legalDocOnlyCookie });
    assert.equal(legalDocOnlyProjectDetail.status, 403);
    const legalDocOnlyLegalDocs = await request("/legal-docs", { cookie: legalDocOnlyCookie });
    assert.equal(legalDocOnlyLegalDocs.status, 200);
    const legalDocOnlyLegalDocsPayload = (await legalDocOnlyLegalDocs.json()) as Array<{ id: string }>;
    assert.deepEqual(legalDocOnlyLegalDocsPayload.map((entry) => entry.id), [visibleLegalDoc.id]);

    const viewAllList = await request("/projects", { cookie: viewAllCookie });
    assert.equal(viewAllList.status, 200);
    const viewAllProjects = (await viewAllList.json()) as Array<{
      id: string;
      currentUserAccessRole?: string;
      currentUserAccessSource?: string;
      currentUserCanWrite?: boolean;
      canUpdate?: boolean;
      canArchive?: boolean;
    }>;
    assert.deepEqual(
      viewAllProjects.map((project) => project.id).sort(),
      [firstProject.id, secondProject.id].sort()
    );
    const viewAllFirstProject = viewAllProjects.find((project) => project.id === firstProject.id);
    assert.equal(viewAllFirstProject?.currentUserAccessSource, "GLOBAL");
    assert.equal(viewAllFirstProject?.currentUserAccessRole, undefined);
    assert.equal(viewAllFirstProject?.currentUserCanWrite, false);
    assert.equal(viewAllFirstProject?.canUpdate, false);
    assert.equal(viewAllFirstProject?.canArchive, false);
    const viewAllDetail = await request(`/projects/${firstProject.id}`, { cookie: viewAllCookie });
    assert.equal(viewAllDetail.status, 200);
    const viewAllDetailPayload = (await viewAllDetail.json()) as {
      project: {
        currentUserAccessRole?: string;
        currentUserAccessSource?: string;
        currentUserCanWrite?: boolean;
        canUpdate?: boolean;
        canArchive?: boolean;
      };
    };
    assert.equal(viewAllDetailPayload.project.currentUserAccessSource, "GLOBAL");
    assert.equal(viewAllDetailPayload.project.currentUserAccessRole, undefined);
    assert.equal(viewAllDetailPayload.project.currentUserCanWrite, false);
    assert.equal(viewAllDetailPayload.project.canUpdate, false);
    assert.equal(viewAllDetailPayload.project.canArchive, false);
    const viewAllPatch = await request(`/projects/${firstProject.id}`, {
      method: "PATCH",
      cookie: viewAllCookie,
      body: {
        title: "View all must not write"
      }
    });
    assert.equal(viewAllPatch.status, 403);

    const globalEditorDetail = await request(`/projects/${firstProject.id}`, { cookie: globalEditorCookie });
    assert.equal(globalEditorDetail.status, 200);
    const globalEditorDetailPayload = (await globalEditorDetail.json()) as {
      project: {
        currentUserAccessRole?: string;
        currentUserAccessSource?: string;
        currentUserCanWrite?: boolean;
        canUpdate?: boolean;
        canArchive?: boolean;
      };
    };
    assert.equal(globalEditorDetailPayload.project.currentUserAccessSource, "GLOBAL");
    assert.equal(globalEditorDetailPayload.project.currentUserAccessRole, "PROJECT_EDITOR");
    assert.equal(globalEditorDetailPayload.project.currentUserCanWrite, true);
    assert.equal(globalEditorDetailPayload.project.canUpdate, true);
    assert.equal(globalEditorDetailPayload.project.canArchive, false);
    const globalEditorPatch = await request(`/projects/${firstProject.id}`, {
      method: "PATCH",
      cookie: globalEditorCookie,
      body: {
        title: "Global editor writes"
      }
    });
    assert.equal(globalEditorPatch.status, 200);

    const internalEmpty = await request("/projects", { cookie: internalCookie });
    assert.equal(internalEmpty.status, 200);
    assert.deepEqual(await internalEmpty.json(), []);

    await prisma.projectAccess.createMany({
      data: [
        {
          projectId: firstProject.id,
          userId: internalUser.id,
          accessRole: "PROJECT_VIEWER"
        },
        {
          projectId: firstProject.id,
          userId: externalUser.id,
          accessRole: "EXTERNAL_PROJECT_VIEWER"
        }
      ]
    });

    const internalList = await request("/projects", { cookie: internalCookie });
    assert.equal(internalList.status, 200);
    const internalProjects = (await internalList.json()) as Array<{ id: string; currentUserAccessRole?: string }>;
    assert.deepEqual(internalProjects.map((project) => project.id), [firstProject.id]);
    assert.equal(internalProjects[0]?.currentUserAccessRole, "PROJECT_VIEWER");
    const internalVisibleDetail = await request(`/projects/${firstProject.id}`, { cookie: internalCookie });
    assert.equal(internalVisibleDetail.status, 200);

    const externalList = await request("/projects", { cookie: externalCookie });
    assert.equal(externalList.status, 200);
    const externalProjects = (await externalList.json()) as Array<{ id: string; currentUserAccessRole?: string }>;
    assert.deepEqual(externalProjects.map((project) => project.id), [firstProject.id]);
    assert.equal(externalProjects[0]?.currentUserAccessRole, "EXTERNAL_PROJECT_VIEWER");
    const externalVisibleDetail = await request(`/projects/${firstProject.id}`, { cookie: externalCookie });
    assert.equal(externalVisibleDetail.status, 200);
    const externalHiddenDetail = await request(`/projects/${secondProject.id}`, { cookie: externalCookie });
    assert.equal(externalHiddenDetail.status, 403);

    const hiddenDetail = await request(`/projects/${secondProject.id}`, { cookie: internalCookie });
    assert.equal(hiddenDetail.status, 403);

    const removeResponse = await request(`/projects/${firstProject.id}/access/${internalUser.id}`, {
      method: "DELETE",
      cookie: adminCookie
    });
    assert.equal(removeResponse.status, 200);

    const internalAfterRemove = await request("/projects", { cookie: internalCookie });
    assert.equal(internalAfterRemove.status, 200);
    assert.deepEqual(await internalAfterRemove.json(), []);
  });

  it("requires legal document read permission in addition to project access", async () => {
    await createRole("PROJECT_SCOPE_ONLY", ["projects.view"]);
    await createRole("LEGAL_DOC_READER_ONLY", ["legalDocs.view"]);

    const projectOnlyUser = await createUser({
      email: "legal-doc-project-only@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_SCOPE_ONLY"
    });
    const legalDocReader = await createUser({
      email: "legal-doc-reader-only@example.com",
      password: "ValidPassword1!",
      role: "LEGAL_DOC_READER_ONLY"
    });
    const domainNoAccessUser = await createUser({
      email: "legal-doc-reader-no-access@example.com",
      password: "ValidPassword1!",
      role: "LEGAL_DOC_READER_ONLY"
    });
    const admin = await createUser({
      email: "legal-doc-admin-all@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const company = await createCompany("Legal Doc Domain Scope Company");
    const visibleProject = await prisma.project.create({
      data: {
        id: "legal-doc-scope-visible",
        title: "Visible Legal Doc Scope",
        companyId: company.id,
        participantUserIds: [],
        internalParticipants: [],
        externalParticipants: [],
        attachments: [],
        dependsOnProjectIds: [],
        referenceLegalDocIds: []
      }
    });
    const hiddenProject = await prisma.project.create({
      data: {
        id: "legal-doc-scope-hidden",
        title: "Hidden Legal Doc Scope",
        companyId: company.id,
        participantUserIds: [],
        internalParticipants: [],
        externalParticipants: [],
        attachments: [],
        dependsOnProjectIds: [],
        referenceLegalDocIds: []
      }
    });
    const visibleLegalDoc = await prisma.legalDocument.create({
      data: {
        id: "legal-doc-domain-visible",
        projectId: visibleProject.id,
        type: "NOTICE",
        title: "Visible Legal Doc",
        attachments: []
      }
    });
    const hiddenLegalDoc = await prisma.legalDocument.create({
      data: {
        id: "legal-doc-domain-hidden",
        projectId: hiddenProject.id,
        type: "NOTICE",
        title: "Hidden Legal Doc",
        attachments: []
      }
    });
    await prisma.projectAccess.createMany({
      data: [
        {
          projectId: visibleProject.id,
          userId: projectOnlyUser.id,
          accessRole: "PROJECT_VIEWER"
        },
        {
          projectId: visibleProject.id,
          userId: legalDocReader.id,
          accessRole: "PROJECT_VIEWER"
        }
      ]
    });

    const projectOnlyCookie = await login(projectOnlyUser.email, "ValidPassword1!");
    const legalDocReaderCookie = await login(legalDocReader.email, "ValidPassword1!");
    const domainNoAccessCookie = await login(domainNoAccessUser.email, "ValidPassword1!");
    const adminCookie = await login(admin.email, "ValidPassword1!");

    const projectOnlyList = await request("/legal-docs", { cookie: projectOnlyCookie });
    assert.equal(projectOnlyList.status, 200);
    assert.deepEqual(await projectOnlyList.json(), []);
    const projectOnlyDetail = await request(`/legal-docs/${visibleLegalDoc.id}`, { cookie: projectOnlyCookie });
    assert.equal(projectOnlyDetail.status, 403);
    const projectOnlyMissingDetail = await request("/legal-docs/does-not-exist", { cookie: projectOnlyCookie });
    assert.equal(projectOnlyMissingDetail.status, 403);

    const scopedList = await request("/legal-docs", { cookie: legalDocReaderCookie });
    assert.equal(scopedList.status, 200);
    const scopedPayload = (await scopedList.json()) as Array<{ id: string }>;
    assert.deepEqual(scopedPayload.map((entry) => entry.id), [visibleLegalDoc.id]);
    const hiddenDetail = await request(`/legal-docs/${hiddenLegalDoc.id}`, { cookie: legalDocReaderCookie });
    assert.equal(hiddenDetail.status, 403);

    const domainNoAccessList = await request("/legal-docs", { cookie: domainNoAccessCookie });
    assert.equal(domainNoAccessList.status, 200);
    assert.deepEqual(await domainNoAccessList.json(), []);

    const adminList = await request("/legal-docs", { cookie: adminCookie });
    assert.equal(adminList.status, 200);
    const adminPayload = (await adminList.json()) as Array<{ id: string }>;
    assert.deepEqual(
      adminPayload.map((entry) => entry.id).sort(),
      [visibleLegalDoc.id, hiddenLegalDoc.id].sort()
    );
  });

  it("allows user admins to manage project access without projects.edit", async () => {
    await createRole("PROJECT_ACCESS_USER_ADMIN", ["admin.access", "users.manage"]);
    await createRole("PROJECT_ACCESS_UNAUTHORIZED", ["admin.access"]);
    await createRole("PROJECT_ACCESS_PROJECT_EDITOR_ADMIN", ["admin.access", "projects.edit"]);
    await createRole("PROJECT_ACCESS_PROJECT_EDITOR_ONLY", ["projects.edit"]);
    await createRole("PROJECT_ACCESS_VIEW_ALL_EDIT_ONLY", ["projects.viewAll", "projects.edit"]);
    await createRole("PROJECT_ACCESS_USERS_MANAGE_ONLY", ["users.manage"]);

    const userAdmin = await createUser({
      email: "project-access-user-admin@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_ACCESS_USER_ADMIN"
    });
    const unauthorized = await createUser({
      email: "project-access-unauthorized@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_ACCESS_UNAUTHORIZED"
    });
    const projectEditorAdmin = await createUser({
      email: "project-access-editor-admin@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_ACCESS_PROJECT_EDITOR_ADMIN"
    });
    const projectEditorOnly = await createUser({
      email: "project-access-editor-only@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_ACCESS_PROJECT_EDITOR_ONLY"
    });
    const viewAllEditOnly = await createUser({
      email: "project-access-view-all-edit-only@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_ACCESS_VIEW_ALL_EDIT_ONLY"
    });
    const usersManageOnly = await createUser({
      email: "project-access-users-only@example.com",
      password: "ValidPassword1!",
      role: "PROJECT_ACCESS_USERS_MANAGE_ONLY"
    });
    const target = await createUser({
      email: "project-access-target@example.com",
      password: "ValidPassword1!"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "Project Access Requester External Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalRequester = await createUser({
      email: "project-access-requester-external@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const company = await createCompany("Project Access Mutation Company");
    const project = await prisma.project.create({
      data: {
        id: "project-access-users-manage",
        title: "Project Access Users Manage",
        companyId: company.id,
        participantUserIds: [],
        internalParticipants: [],
        externalParticipants: [],
        attachments: [],
        dependsOnProjectIds: [],
        referenceLegalDocIds: []
      }
    });

    const userAdminCookie = await login(userAdmin.email, "ValidPassword1!");
    const unauthorizedCookie = await login(unauthorized.email, "ValidPassword1!");
    const projectEditorAdminCookie = await login(projectEditorAdmin.email, "ValidPassword1!");
    const projectEditorOnlyCookie = await login(projectEditorOnly.email, "ValidPassword1!");
    const viewAllEditOnlyCookie = await login(viewAllEditOnly.email, "ValidPassword1!");
    const usersManageOnlyCookie = await login(usersManageOnly.email, "ValidPassword1!");
    const externalCookie = await login(externalRequester.email, "ValidPassword1!");

    const userAdminList = await request("/projects", { cookie: userAdminCookie });
    assert.equal(userAdminList.status, 200);
    assert.deepEqual(await userAdminList.json(), []);
    const userAdminDetail = await request(`/projects/${project.id}`, { cookie: userAdminCookie });
    assert.equal(userAdminDetail.status, 403);

    const grantResponse = await request(`/projects/${project.id}/access/${target.id}`, {
      method: "PUT",
      cookie: userAdminCookie,
      body: {
        accessRole: "PROJECT_VIEWER"
      }
    });
    assert.equal(grantResponse.status, 200);
    assert.equal(
      await prisma.projectAccess.count({
        where: {
          projectId: project.id,
          userId: target.id
        }
      }),
      1
    );

    const unauthorizedResponse = await request(`/projects/${project.id}/access/${target.id}`, {
      method: "PUT",
      cookie: unauthorizedCookie,
      body: {
        accessRole: "PROJECT_EDITOR"
      }
    });
    assert.equal(unauthorizedResponse.status, 403);

    const projectEditorAdminResponse = await request(`/projects/${project.id}/access/${target.id}`, {
      method: "PUT",
      cookie: projectEditorAdminCookie,
      body: {
        accessRole: "PROJECT_EDITOR"
      }
    });
    assert.equal(projectEditorAdminResponse.status, 403);
    const projectEditorAdminDelete = await request(`/projects/${project.id}/access/${target.id}`, {
      method: "DELETE",
      cookie: projectEditorAdminCookie
    });
    assert.equal(projectEditorAdminDelete.status, 403);

    const projectEditorOnlyResponse = await request(`/projects/${project.id}/access/${target.id}`, {
      method: "PUT",
      cookie: projectEditorOnlyCookie,
      body: {
        accessRole: "PROJECT_EDITOR"
      }
    });
    assert.equal(projectEditorOnlyResponse.status, 403);

    const viewAllEditOnlyResponse = await request(`/projects/${project.id}/access/${target.id}`, {
      method: "PUT",
      cookie: viewAllEditOnlyCookie,
      body: {
        accessRole: "PROJECT_EDITOR"
      }
    });
    assert.equal(viewAllEditOnlyResponse.status, 403);

    const usersManageOnlyResponse = await request(`/projects/${project.id}/access/${target.id}`, {
      method: "PUT",
      cookie: usersManageOnlyCookie,
      body: {
        accessRole: "PROJECT_EDITOR"
      }
    });
    assert.equal(usersManageOnlyResponse.status, 403);

    const externalResponse = await request(`/projects/${project.id}/access/${target.id}`, {
      method: "PUT",
      cookie: externalCookie,
      body: {
        accessRole: "PROJECT_EDITOR"
      }
    });
    assert.equal(externalResponse.status, 403);

    const removeResponse = await request(`/projects/${project.id}/access/${target.id}`, {
      method: "DELETE",
      cookie: userAdminCookie
    });
    assert.equal(removeResponse.status, 200);
    assert.equal(
      await prisma.projectAccess.count({
        where: {
          projectId: project.id,
          userId: target.id
        }
      }),
      0
    );

    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: projectEditorOnly.id,
        accessRole: "PROJECT_EDITOR"
      }
    });
    const editResponse = await request(`/projects/${project.id}`, {
      method: "PATCH",
      cookie: projectEditorOnlyCookie,
      body: {
        title: "Project Access Normal Edit"
      }
    });
    assert.equal(editResponse.status, 200);
    const edited = await prisma.project.findUniqueOrThrow({
      where: {
        id: project.id
      },
      select: {
        title: true
      }
    });
    assert.equal(edited.title, "Project Access Normal Edit");
  });
});

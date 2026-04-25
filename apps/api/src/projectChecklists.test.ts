import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

async function request(
  pathname: string,
  options: { method?: string; body?: unknown; cookie?: string } = {}
) {
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

async function createUser(args: { email: string; password: string; role?: string }) {
  return prisma.user.create({
    data: {
      firstName: "Checklist",
      lastName: "Tester",
      email: args.email,
      role: args.role ?? "USER",
      type: "INTERNAL",
      passwordHash: await hashPassword(args.password)
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

async function createProject(companyId: string, title = "Checklist Project") {
  return prisma.project.create({
    data: {
      id: `p-${randomUUID()}`,
      title,
      companyId,
      participantUserIds: [],
      internalParticipants: [],
      externalParticipants: [],
      attachments: [],
      dependsOnProjectIds: [],
      referenceLegalDocIds: []
    }
  });
}

describe("Project checklists", () => {
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
    await prisma.$executeRawUnsafe('DELETE FROM "ProjectChecklistItem"');
    await prisma.$executeRawUnsafe('DELETE FROM "ProjectChecklistSection"');
    await prisma.$executeRawUnsafe('DELETE FROM "ProjectChecklist"');
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
  });

  it("returns null when a project has no checklist", async () => {
    const user = await createUser({
      email: "project-checklist-empty@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Checklist Company");
    const project = await createProject(company.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request(`/projects/${project.id}/checklist`, {
      cookie
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { checklist: null };
    assert.equal(payload.checklist, null);
  });

  it("creates and returns a project checklist snapshot", async () => {
    const user = await createUser({
      email: "project-checklist-save@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Checklist Company");
    const project = await createProject(company.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request(`/projects/${project.id}/checklist`, {
      method: "PUT",
      cookie,
      body: {
        id: "pcl-1",
        sections: [
          {
            id: "pcs-1",
            title: "Verfahren",
            description: "Fachliche Pruefpunkte",
            items: [
              {
                id: "pci-1",
                title: "Projektunterlagen sichten",
                status: "OPEN"
              },
              {
                id: "pci-2",
                title: "Rueckfragen sammeln",
                description: "Optionaler Hinweis",
                status: "IN_PROGRESS"
              }
            ]
          }
        ]
      }
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      checklist: {
        id: string;
        projectId: string;
        sections: Array<{
          id: string;
          title: string;
          items: Array<{ id: string; status: string }>;
        }>;
      };
    };

    assert.equal(payload.checklist.id, "pcl-1");
    assert.equal(payload.checklist.projectId, project.id);
    assert.equal(payload.checklist.sections.length, 1);
    assert.equal(payload.checklist.sections[0]?.items.length, 2);
    assert.equal(payload.checklist.sections[0]?.items[1]?.status, "IN_PROGRESS");

    const checklistRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "ProjectChecklist"
      WHERE "projectId" = ${project.id}
    `;
    assert.equal(checklistRows.length, 1);

    const sectionRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "ProjectChecklistSection"
      WHERE "projectChecklistId" = ${checklistRows[0]?.id ?? ""}
    `;
    assert.equal(sectionRows.length, 1);

    const itemRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "ProjectChecklistItem"
      WHERE "projectChecklistSectionId" = ${sectionRows[0]?.id ?? ""}
    `;
    assert.equal(itemRows.length, 2);
  });

  it("deletes a project checklist", async () => {
    const user = await createUser({
      email: "project-checklist-delete@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Checklist Company");
    const project = await createProject(company.id);
    const cookie = await login(user.email, "ValidPassword1!");

    await request(`/projects/${project.id}/checklist`, {
      method: "PUT",
      cookie,
      body: {
        sections: [
          {
            title: "Sektion",
            items: [{ title: "Punkt", status: "DONE" }]
          }
        ]
      }
    });

    const deleteResponse = await request(`/projects/${project.id}/checklist`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 200);

    const stored = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "ProjectChecklist"
      WHERE "projectId" = ${project.id}
    `;
    assert.equal(stored.length, 0);
  });

  it("bulk-replaces project checklists for admin imports", async () => {
    const user = await createUser({
      email: "project-checklist-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const company = await createCompany("Checklist Company");
    const firstProject = await createProject(company.id, "Erstes Projekt");
    const secondProject = await createProject(company.id, "Zweites Projekt");
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/admin/internal/project-checklists/bulk-replace", {
      method: "PUT",
      cookie,
      body: [
        {
          id: "pcl-a",
          projectId: firstProject.id,
          sections: [
            {
              id: "pcs-a",
              title: "Sektion A",
              items: [{ id: "pci-a", title: "Punkt A", status: "DONE" }]
            }
          ]
        },
        {
          id: "pcl-b",
          projectId: secondProject.id,
          sections: [
            {
              id: "pcs-b",
              title: "Sektion B",
              items: [{ id: "pci-b", title: "Punkt B", status: "NOT_REQUIRED" }]
            }
          ]
        }
      ]
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      projectChecklists: Array<{ projectId: string }>;
    };
    assert.equal(payload.projectChecklists.length, 2);
    assert.deepEqual(
      payload.projectChecklists.map((checklist) => checklist.projectId).sort(),
      [firstProject.id, secondProject.id].sort()
    );
  });

  it("rejects project checklist bulk deletes for admins without project data-management permissions", async () => {
    const roleKey = `LIMITED_ADMIN_BULK_${randomUUID().replace(/-/g, "_")}`;
    await prisma.role.create({
      data: {
        key: roleKey,
        labelDe: "Limited Admin Bulk",
        permissionsJson: ["admin.access", "users.view"]
      }
    });
    const user = await createUser({
      email: "project-checklist-limited-admin@example.com",
      password: "ValidPassword1!",
      role: roleKey
    });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/admin/internal/project-checklists/bulk-delete", {
      method: "DELETE",
      cookie
    });

    assert.equal(response.status, 403);
  });

  it("bulk-replace only updates the submitted project ids", async () => {
    const user = await createUser({
      email: "project-checklist-scope@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const company = await createCompany("Checklist Company");
    const firstProject = await createProject(company.id, "Erstes Projekt");
    const secondProject = await createProject(company.id, "Zweites Projekt");
    const cookie = await login(user.email, "ValidPassword1!");

    await request("/admin/internal/project-checklists/bulk-replace", {
      method: "PUT",
      cookie,
      body: [
        {
          id: "pcl-a",
          projectId: firstProject.id,
          sections: [
            {
              id: "pcs-a",
              title: "Sektion A",
              items: [{ id: "pci-a", title: "Punkt A", status: "DONE" }]
            }
          ]
        },
        {
          id: "pcl-b",
          projectId: secondProject.id,
          sections: [
            {
              id: "pcs-b",
              title: "Sektion B",
              items: [{ id: "pci-b", title: "Punkt B", status: "NOT_REQUIRED" }]
            }
          ]
        }
      ]
    });

    const replaceResponse = await request("/admin/internal/project-checklists/bulk-replace", {
      method: "PUT",
      cookie,
      body: [
        {
          id: "pcl-a-2",
          projectId: firstProject.id,
          sections: [
            {
              id: "pcs-a-2",
              title: "Sektion A aktualisiert",
              items: [{ id: "pci-a-2", title: "Punkt A2", status: "OPEN" }]
            }
          ]
        }
      ]
    });

    assert.equal(replaceResponse.status, 200);

    const firstResponse = await request(`/projects/${firstProject.id}/checklist`, {
      cookie
    });
    const secondResponse = await request(`/projects/${secondProject.id}/checklist`, {
      cookie
    });

    const firstPayload = (await firstResponse.json()) as {
      checklist: { id: string; sections: Array<{ title: string }> } | null;
    };
    const secondPayload = (await secondResponse.json()) as {
      checklist: { id: string; sections: Array<{ title: string }> } | null;
    };

    assert.equal(firstPayload.checklist?.id, "pcl-a-2");
    assert.equal(firstPayload.checklist?.sections[0]?.title, "Sektion A aktualisiert");
    assert.equal(secondPayload.checklist?.id, "pcl-b");
    assert.equal(secondPayload.checklist?.sections[0]?.title, "Sektion B");
  });

  it("bulk-delete removes all project checklists explicitly", async () => {
    const user = await createUser({
      email: "project-checklist-delete-all@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const company = await createCompany("Checklist Company");
    const firstProject = await createProject(company.id, "Erstes Projekt");
    const secondProject = await createProject(company.id, "Zweites Projekt");
    const cookie = await login(user.email, "ValidPassword1!");

    await request("/admin/internal/project-checklists/bulk-replace", {
      method: "PUT",
      cookie,
      body: [
        {
          id: "pcl-a",
          projectId: firstProject.id,
          sections: [
            {
              id: "pcs-a",
              title: "Sektion A",
              items: [{ id: "pci-a", title: "Punkt A", status: "DONE" }]
            }
          ]
        },
        {
          id: "pcl-b",
          projectId: secondProject.id,
          sections: [
            {
              id: "pcs-b",
              title: "Sektion B",
              items: [{ id: "pci-b", title: "Punkt B", status: "NOT_REQUIRED" }]
            }
          ]
        }
      ]
    });

    const deleteResponse = await request("/admin/internal/project-checklists/bulk-delete", {
      method: "DELETE",
      cookie
    });

    assert.equal(deleteResponse.status, 200);

    const checklistRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "ProjectChecklist"
    `;
    assert.equal(checklistRows.length, 0);
  });
});

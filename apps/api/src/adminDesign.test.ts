import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { resolveDatabaseUrl, type AppConfig } from "./config.js";
import { prisma } from "./prisma.js";
import { hashPassword } from "./security.js";
import { describe, before, after, beforeEach, it } from "node:test";

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let requestCounter = 0;

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
]);
const iconBytes = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]);

async function request(pathname: string, options: { method?: string; body?: unknown; cookie?: string } = {}) {
  requestCounter += 1;
  const headers = new Headers();
  headers.set("X-Forwarded-For", `127.0.0.${(requestCounter % 200) + 1}`);

  if (options.cookie) {
    headers.set("Cookie", options.cookie);
  }

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
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

async function createUser(email: string, password: string, options?: { role?: string; type?: "INTERNAL" | "EXTERNAL" }) {
  return prisma.user.create({
    data: {
      firstName: "Design",
      lastName: "Admin",
      email,
      role: options?.role ?? "ADMIN",
      type: options?.type ?? "INTERNAL",
      passwordHash: await hashPassword(password)
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

async function uploadBrandingAsset(args: {
  cookie: string;
  kind: "logo" | "icon";
  bytes: Buffer;
  filename: string;
  mimeType: string;
}) {
  requestCounter += 1;
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(args.bytes)], { type: args.mimeType }), args.filename);

  const headers = new Headers();
  headers.set("X-Forwarded-For", `127.0.0.${(requestCounter % 200) + 1}`);
  headers.set("Cookie", args.cookie);

  return fetch(`${baseUrl}/admin/design/${args.kind}`, {
    method: "POST",
    headers,
    body: form
  });
}

describe("Admin Design API", () => {
  before(async () => {
    const config: AppConfig = {
      port: 0,
      databaseUrl: resolveDatabaseUrl(process.env, "test"),
      appOrigin: "http://localhost:5173",
      notificationBaseUrl: "http://localhost:5173",
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
    await prisma.brandingAsset.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  });

  it("admin can read empty design config without fallback assets", async () => {
    const admin = await createUser("design-empty@example.com", "ValidPassword1!");
    const cookie = await login(admin.email, "ValidPassword1!");

    const adminResponse = await request("/admin/design", { cookie });
    assert.equal(adminResponse.status, 200);
    const adminPayload = (await adminResponse.json()) as { hasLogo: boolean; hasIcon: boolean; logoUrl?: string };
    assert.equal(adminPayload.hasLogo, false);
    assert.equal(adminPayload.hasIcon, false);
    assert.equal(adminPayload.logoUrl, undefined);

    const brandingResponse = await request("/branding", { cookie });
    assert.equal(brandingResponse.status, 200);
    const brandingPayload = (await brandingResponse.json()) as { hasLogo: boolean; hasIcon: boolean };
    assert.equal(brandingPayload.hasLogo, false);
    assert.equal(brandingPayload.hasIcon, false);

    const missingLogo = await request("/branding/logo", { cookie });
    assert.equal(missingLogo.status, 404);
  });

  it("admin can upload and download logo and sidebar icon", async () => {
    const admin = await createUser("design-upload@example.com", "ValidPassword1!");
    const cookie = await login(admin.email, "ValidPassword1!");

    const logoResponse = await uploadBrandingAsset({
      cookie,
      kind: "logo",
      bytes: pngBytes,
      filename: "portal-logo.png",
      mimeType: "image/png"
    });
    assert.equal(logoResponse.status, 200);

    const iconResponse = await uploadBrandingAsset({
      cookie,
      kind: "icon",
      bytes: iconBytes,
      filename: "sidebar.ico",
      mimeType: "image/x-icon"
    });
    assert.equal(iconResponse.status, 200);

    const configResponse = await request("/branding", { cookie });
    const configPayload = (await configResponse.json()) as {
      hasLogo: boolean;
      hasIcon: boolean;
      logoUrl?: string;
      iconUrl?: string;
    };
    assert.equal(configPayload.hasLogo, true);
    assert.equal(configPayload.hasIcon, true);
    assert.match(configPayload.logoUrl ?? "", /^\/branding\/logo\?v=/);
    assert.match(configPayload.iconUrl ?? "", /^\/branding\/icon\?v=/);

    const logoDownload = await request("/branding/logo", { cookie });
    assert.equal(logoDownload.status, 200);
    assert.equal(logoDownload.headers.get("content-type"), "image/png");
    assert.equal(Buffer.compare(Buffer.from(await logoDownload.arrayBuffer()), pngBytes), 0);

    const iconDownload = await request("/branding/icon", { cookie });
    assert.equal(iconDownload.status, 200);
    assert.equal(iconDownload.headers.get("content-type"), "image/x-icon");
  });

  it("replaces existing assets instead of duplicating them", async () => {
    const admin = await createUser("design-replace@example.com", "ValidPassword1!");
    const cookie = await login(admin.email, "ValidPassword1!");

    assert.equal(
      (await uploadBrandingAsset({ cookie, kind: "logo", bytes: pngBytes, filename: "first.png", mimeType: "image/png" }))
        .status,
      200
    );
    assert.equal(
      (await uploadBrandingAsset({ cookie, kind: "logo", bytes: pngBytes, filename: "second.png", mimeType: "image/png" }))
        .status,
      200
    );

    const rows = await prisma.brandingAsset.findMany({ where: { type: "SIDEBAR_LOGO" } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.fileName, "second.png");
  });

  it("rejects unsupported and oversized branding uploads", async () => {
    const admin = await createUser("design-validation@example.com", "ValidPassword1!");
    const cookie = await login(admin.email, "ValidPassword1!");

    const svgResponse = await uploadBrandingAsset({
      cookie,
      kind: "logo",
      bytes: Buffer.from("<svg><script>alert(1)</script></svg>"),
      filename: "logo.svg",
      mimeType: "image/svg+xml"
    });
    assert.equal(svgResponse.status, 400);

    const oversizedPng = Buffer.concat([pngBytes, Buffer.alloc(1024 * 1024)]);
    const largeResponse = await uploadBrandingAsset({
      cookie,
      kind: "logo",
      bytes: oversizedPng,
      filename: "too-large.png",
      mimeType: "image/png"
    });
    assert.equal(largeResponse.status, 413);
  });

  it("restricts admin design writes to internal admins with master data management", async () => {
    await createRole("DESIGN_NO_MASTER_DATA", ["admin.access"]);
    await createRole("DESIGN_MASTER_DATA_NO_ADMIN", ["masterData.manage"]);

    const noMasterData = await createUser("design-no-master@example.com", "ValidPassword1!", {
      role: "DESIGN_NO_MASTER_DATA"
    });
    const noAdmin = await createUser("design-no-admin@example.com", "ValidPassword1!", {
      role: "DESIGN_MASTER_DATA_NO_ADMIN"
    });
    const externalUser = await createUser("design-external@example.com", "ValidPassword1!", {
      role: "EXTERNAL",
      type: "EXTERNAL"
    });

    const noMasterCookie = await login(noMasterData.email, "ValidPassword1!");
    const noAdminCookie = await login(noAdmin.email, "ValidPassword1!");
    const externalCookie = await login(externalUser.email, "ValidPassword1!");

    assert.equal(
      (await uploadBrandingAsset({ cookie: noMasterCookie, kind: "logo", bytes: pngBytes, filename: "blocked.png", mimeType: "image/png" }))
        .status,
      403
    );
    assert.equal(
      (await uploadBrandingAsset({ cookie: noAdminCookie, kind: "logo", bytes: pngBytes, filename: "blocked.png", mimeType: "image/png" }))
        .status,
      403
    );
    assert.equal(
      (await uploadBrandingAsset({ cookie: externalCookie, kind: "logo", bytes: pngBytes, filename: "blocked.png", mimeType: "image/png" }))
        .status,
      403
    );

    const externalBranding = await request("/branding", { cookie: externalCookie });
    assert.equal(externalBranding.status, 200);
  });

  it("removes logo and icon without returning placeholders", async () => {
    const admin = await createUser("design-delete@example.com", "ValidPassword1!");
    const cookie = await login(admin.email, "ValidPassword1!");

    assert.equal(
      (await uploadBrandingAsset({ cookie, kind: "logo", bytes: pngBytes, filename: "logo.png", mimeType: "image/png" }))
        .status,
      200
    );
    assert.equal(
      (await uploadBrandingAsset({ cookie, kind: "icon", bytes: iconBytes, filename: "icon.ico", mimeType: "image/x-icon" }))
        .status,
      200
    );

    const deleteLogo = await request("/admin/design/logo", { method: "DELETE", cookie });
    assert.equal(deleteLogo.status, 200);
    const deleteIcon = await request("/admin/design/icon", { method: "DELETE", cookie });
    assert.equal(deleteIcon.status, 200);

    const configResponse = await request("/branding", { cookie });
    const configPayload = (await configResponse.json()) as { hasLogo: boolean; hasIcon: boolean };
    assert.equal(configPayload.hasLogo, false);
    assert.equal(configPayload.hasIcon, false);

    const missingLogo = await request("/branding/logo", { cookie });
    assert.equal(missingLogo.status, 404);
    const missingIcon = await request("/branding/icon", { cookie });
    assert.equal(missingIcon.status, 404);
  });
});

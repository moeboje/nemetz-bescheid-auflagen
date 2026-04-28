import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { authenticator } from "otplib";
import { Prisma } from "@prisma/client";
import { createApp } from "./app.js";
import { resolveDatabaseUrl, type AppConfig } from "./config.js";
import { prisma } from "./prisma.js";
import { hashPassword, hashToken } from "./security.js";
import { setStoredRolePermissionKeys } from "./rolePermissions.js";

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let notificationBaseUrl = "";
let notificationServer: http.Server;
const capturedNotifications: Array<Record<string, unknown>> = [];
let loginRequestCounter = 0;

async function request(
  pathname: string,
  options: { method?: string; body?: unknown; cookie?: string; ip?: string; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = {};
  headers["X-Forwarded-For"] = options.ip ?? "127.0.0.1";

  if (options.cookie) {
    headers.Cookie = options.cookie;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      headers[key] = value;
    });
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  return response;
}

function extractSessionCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return "";
  }

  const match = setCookieHeader.match(/nemetz_session=[^;]+/);
  return match ? match[0] : "";
}

async function createUser(email: string, password: string) {
  return prisma.user.create({
    data: {
      firstName: "Test",
      lastName: "User",
      email,
      role: "ADMIN",
      type: "INTERNAL",
      passwordHash: await hashPassword(password)
    }
  });
}

async function waitForCapturedNotification(
  eventType: string,
  timeoutMs = 1_500
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const match = capturedNotifications.find((entry) => entry.eventType === eventType);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.fail(`Expected captured notification for ${eventType}`);
}

function readSecretFromOtpAuthUrl(otpauthUrl: string) {
  const parsed = new URL(otpauthUrl);
  const secret = parsed.searchParams.get("secret");
  assert.ok(secret, "Expected secret in otpauth URL");
  return secret;
}

async function loginWithPassword(email: string, password: string, ip?: string) {
  loginRequestCounter += 1;
  const response = await request("/auth/login", {
    method: "POST",
    ip: ip ?? `127.0.0.${(loginRequestCounter % 200) + 1}`,
    body: {
      email,
      password
    }
  });

  assert.equal(response.status, 200);
  return response;
}

async function makeUserExternal(userId: string) {
  await prisma.user.update({
    where: {
      id: userId
    },
    data: {
      role: "EXTERNAL",
      type: "EXTERNAL"
    }
  });
}

async function requestResetToken(email: string, ip: string) {
  const forgotResponse = await request("/auth/password/forgot", {
    method: "POST",
    ip,
    body: {
      email
    }
  });
  assert.equal(forgotResponse.status, 200);

  const notification = await waitForCapturedNotification("PASSWORD_RESET_LINK");
  const resetLink = String(notification.link ?? "");
  assert.ok(resetLink, "Expected reset link in notification payload");
  const token = new URL(resetLink).searchParams.get("token");
  assert.ok(token, "Expected token in reset link");
  return token;
}

describe("Auth API", () => {
  before(async () => {
    notificationServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      req.on("end", () => {
        const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
        capturedNotifications.push(body as Record<string, unknown>);
        res.writeHead(200, {
          "Content-Type": "application/json"
        });
        res.end(JSON.stringify({ ok: true, flowRunId: "test-flow-run" }));
      });
    });
    notificationServer.listen(0);
    await once(notificationServer, "listening");
    const notificationAddress = notificationServer.address() as AddressInfo;
    notificationBaseUrl = `http://127.0.0.1:${notificationAddress.port}`;

    const config: AppConfig = {
      port: 0,
      databaseUrl: resolveDatabaseUrl(process.env, "test"),
      appOrigin: "http://localhost:5173",
      notificationBaseUrl: "http://localhost:5173",
      notificationDispatchEnabled: true,
      notificationDryRun: false,
      notificationFromLabel: "Nemetz Portal",
      powerAutomateNotificationWebhookUrl: `${notificationBaseUrl}/notify`,
      powerAutomateNotificationSecret: "test-notification-secret",
      notificationMaxAttempts: 5,
      notificationDispatchBatchSize: 25,
      notificationDispatchTimeoutMs: 15_000,
      notificationClaimLeaseSeconds: 300,
      notificationTimeZone: "Europe/Vienna",
      sessionSecret: "test-secret",
      nodeEnv: "test",
      resetTokenTtlMinutes: 120,
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
    notificationServer.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    capturedNotifications.length = 0;
    loginRequestCounter = 0;
    await prisma.session.deleteMany();
    await prisma.mfaChallenge.deleteMany();
    await prisma.mfaPending.deleteMany();
    await prisma.notificationOutbox.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.$executeRaw(Prisma.sql`DELETE FROM "SecuritySettings"`);
  });

  it("login success and me returns current user", async () => {
    await createUser("login-success@example.com", "ValidPassword1!");

    const loginResponse = await request("/auth/login", {
      method: "POST",
      body: {
        email: "LOGIN-SUCCESS@example.com",
        password: "ValidPassword1!"
      }
    });

    assert.equal(loginResponse.status, 200);

    const sessionCookie = extractSessionCookie(loginResponse.headers.get("set-cookie"));
    assert.ok(sessionCookie, "Expected session cookie");

    const meResponse = await request("/auth/me", {
      cookie: sessionCookie
    });

    assert.equal(meResponse.status, 200);
    const mePayload = (await meResponse.json()) as { user: { email: string } };
    assert.equal(mePayload.user.email, "login-success@example.com");
  });

  it("preserves legacy internal permissions for custom roles without permissionsJson", async () => {
    await prisma.role.create({
      data: {
        key: "QUALITY_MANAGER",
        labelDe: "Qualitaetsmanagement",
        isSystem: false
      }
    });
    await createUser("custom-role@example.com", "ValidPassword1!");
    await prisma.user.update({
      where: {
        email: "custom-role@example.com"
      },
      data: {
        role: "QUALITY_MANAGER",
        type: "INTERNAL"
      }
    });

    const loginResponse = await request("/auth/login", {
      method: "POST",
      body: {
        email: "custom-role@example.com",
        password: "ValidPassword1!"
      }
    });

    assert.equal(loginResponse.status, 200);
    const sessionCookie = extractSessionCookie(loginResponse.headers.get("set-cookie"));
    assert.ok(sessionCookie, "Expected session cookie");

    const meResponse = await request("/auth/me", {
      cookie: sessionCookie
    });

    assert.equal(meResponse.status, 200);
    const mePayload = (await meResponse.json()) as { user: { effectivePermissions: string[] } };
    assert.equal(mePayload.user.effectivePermissions.includes("masterData.manage"), true);
    assert.equal(mePayload.user.effectivePermissions.includes("projects.archive"), true);
    assert.equal(mePayload.user.effectivePermissions.includes("authorities.manage"), true);
    assert.equal(mePayload.user.effectivePermissions.includes("admin.access"), false);
  });

  it("preserves explicitly empty permissionsJson for custom roles", async () => {
    const role = await prisma.role.create({
      data: {
        key: "NO_ACCESS",
        labelDe: "Ohne Zugriff",
        isSystem: false
      }
    });
    await setStoredRolePermissionKeys(prisma, role.key, []);

    await createUser("empty-role@example.com", "ValidPassword1!");
    await prisma.user.update({
      where: {
        email: "empty-role@example.com"
      },
      data: {
        role: role.key,
        type: "INTERNAL"
      }
    });

    const loginResponse = await request("/auth/login", {
      method: "POST",
      body: {
        email: "empty-role@example.com",
        password: "ValidPassword1!"
      }
    });

    assert.equal(loginResponse.status, 200);
    const sessionCookie = extractSessionCookie(loginResponse.headers.get("set-cookie"));
    assert.ok(sessionCookie, "Expected session cookie");

    const meResponse = await request("/auth/me", {
      cookie: sessionCookie
    });

    assert.equal(meResponse.status, 200);
    const mePayload = (await meResponse.json()) as { user: { effectivePermissions: string[] } };
    assert.deepEqual(mePayload.user.effectivePermissions, []);
  });

  it("allows authority managers with admin access to read authorities and resolves authorities.view effectively", async () => {
    const role = await prisma.role.create({
      data: {
        key: "AUTHORITY_MANAGER",
        labelDe: "Behoerdenmanager",
        isSystem: false
      }
    });
    await setStoredRolePermissionKeys(prisma, role.key, ["admin.access", "authorities.manage"]);

    await createUser("authority-manager@example.com", "ValidPassword1!");
    await prisma.user.update({
      where: {
        email: "authority-manager@example.com"
      },
      data: {
        role: role.key,
        type: "INTERNAL"
      }
    });

    const loginResponse = await request("/auth/login", {
      method: "POST",
      body: {
        email: "authority-manager@example.com",
        password: "ValidPassword1!"
      }
    });

    assert.equal(loginResponse.status, 200);
    const sessionCookie = extractSessionCookie(loginResponse.headers.get("set-cookie"));
    assert.ok(sessionCookie, "Expected session cookie");

    const meResponse = await request("/auth/me", {
      cookie: sessionCookie
    });

    assert.equal(meResponse.status, 200);
    const mePayload = (await meResponse.json()) as { user: { effectivePermissions: string[] } };
    assert.equal(mePayload.user.effectivePermissions.includes("admin.access"), true);
    assert.equal(mePayload.user.effectivePermissions.includes("authorities.manage"), true);
    assert.equal(mePayload.user.effectivePermissions.includes("authorities.view"), true);

    const authoritiesResponse = await request("/authorities", {
      cookie: sessionCookie
    });
    assert.equal(authoritiesResponse.status, 200);
  });

  it("allows master data managers to read scopes through masterData.manage", async () => {
    const role = await prisma.role.create({
      data: {
        key: "MASTER_DATA_MANAGER",
        labelDe: "Stammdatenmanager",
        isSystem: false
      }
    });
    await setStoredRolePermissionKeys(prisma, role.key, ["masterData.manage"]);

    await createUser("master-data-manager@example.com", "ValidPassword1!");
    await prisma.user.update({
      where: {
        email: "master-data-manager@example.com"
      },
      data: {
        role: role.key,
        type: "INTERNAL"
      }
    });

    const loginResponse = await request("/auth/login", {
      method: "POST",
      ip: "127.0.0.230",
      body: {
        email: "master-data-manager@example.com",
        password: "ValidPassword1!"
      }
    });

    assert.equal(loginResponse.status, 200);
    const sessionCookie = extractSessionCookie(loginResponse.headers.get("set-cookie"));
    assert.ok(sessionCookie, "Expected session cookie");

    const meResponse = await request("/auth/me", {
      cookie: sessionCookie
    });

    assert.equal(meResponse.status, 200);
    const mePayload = (await meResponse.json()) as { user: { effectivePermissions: string[] } };
    assert.equal(mePayload.user.effectivePermissions.includes("masterData.manage"), true);
    assert.equal(mePayload.user.effectivePermissions.includes("masterData.view"), true);

    const scopesResponse = await request("/scopes", {
      cookie: sessionCookie
    });
    assert.equal(scopesResponse.status, 200);
  });

  it("me requires auth", async () => {
    const response = await request("/auth/me");
    assert.equal(response.status, 401);
  });

  it("blocks cross-site state-changing requests", async () => {
    await createUser("csrf-block@example.com", "ValidPassword1!");

    const loginResponse = await request("/auth/login", {
      method: "POST",
      body: {
        email: "csrf-block@example.com",
        password: "ValidPassword1!"
      }
    });

    const sessionCookie = extractSessionCookie(loginResponse.headers.get("set-cookie"));
    assert.ok(sessionCookie, "Expected session cookie");

    const csrfResponse = await request("/auth/logout", {
      method: "POST",
      cookie: sessionCookie,
      headers: {
        "Sec-Fetch-Site": "cross-site"
      }
    });
    assert.equal(csrfResponse.status, 403);

    const meResponse = await request("/auth/me", {
      cookie: sessionCookie
    });
    assert.equal(meResponse.status, 200);
  });

  it("locks account after repeated failed logins", async () => {
    await createUser("lockout@example.com", "ValidPassword1!");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request("/auth/login", {
        method: "POST",
        body: {
          email: "lockout@example.com",
          password: "wrong-password"
        }
      });
      assert.equal(response.status, 401);
    }

    const lockedResponse = await request("/auth/login", {
      method: "POST",
      body: {
        email: "lockout@example.com",
        password: "ValidPassword1!"
      }
    });

    assert.equal(lockedResponse.status, 429);
  });

  it("disabling external users revokes active external sessions and blocks route-auth endpoints", async () => {
    const admin = await createUser("external-toggle-admin@example.com", "ValidPassword1!");
    const externalUser = await createUser("external-toggle-user@example.com", "ValidPassword1!");
    await prisma.user.update({
      where: {
        id: externalUser.id
      },
      data: {
        role: "EXTERNAL",
        type: "EXTERNAL"
      }
    });

    const adminCookie = await loginWithPassword(admin.email, "ValidPassword1!").then((response) =>
      extractSessionCookie(response.headers.get("set-cookie"))
    );
    const externalCookie = await loginWithPassword(externalUser.email, "ValidPassword1!").then((response) =>
      extractSessionCookie(response.headers.get("set-cookie"))
    );
    assert.ok(adminCookie);
    assert.ok(externalCookie);

    const disableResponse = await request("/admin/security", {
      method: "PATCH",
      cookie: adminCookie,
      body: {
        allowExternalUsers: false
      }
    });
    assert.equal(disableResponse.status, 200);

    const meResponse = await request("/auth/me", {
      cookie: externalCookie
    });
    assert.equal(meResponse.status, 401);

    const routeAuthResponse = await request("/scopes", {
      cookie: externalCookie
    });
    assert.equal(routeAuthResponse.status, 401);
  });

  it("forgot password always returns 200", async () => {
    await createUser("forgot@example.com", "ValidPassword1!");

    const existingUserResponse = await request("/auth/password/forgot", {
      method: "POST",
      body: {
        email: "forgot@example.com"
      }
    });

    const missingUserResponse = await request("/auth/password/forgot", {
      method: "POST",
      body: {
        email: "missing@example.com"
      }
    });

    assert.equal(existingUserResponse.status, 200);
    assert.equal(missingUserResponse.status, 200);
  });

  it("returns the live password policy and applies it to own password changes", async () => {
    const admin = await createUser("policy-admin@example.com", "ValidPassword1!");
    const user = await createUser("policy-user@example.com", "ValidPassword1!");

    const adminLogin = await loginWithPassword(admin.email, "ValidPassword1!");
    const adminCookie = extractSessionCookie(adminLogin.headers.get("set-cookie"));
    assert.ok(adminCookie);

    const updateResponse = await request("/admin/security", {
      method: "PATCH",
      cookie: adminCookie,
      body: {
        passwordMinLength: 16,
        passwordRequireNumberOrSpecial: false
      }
    });
    assert.equal(updateResponse.status, 200);

    const userLogin = await loginWithPassword(user.email, "ValidPassword1!");
    const userCookie = extractSessionCookie(userLogin.headers.get("set-cookie"));
    assert.ok(userCookie);

    const policyResponse = await request("/auth/password/policy", {
      cookie: userCookie
    });
    assert.equal(policyResponse.status, 200);
    const policyPayload = (await policyResponse.json()) as {
      passwordMinLength: number;
      passwordRequireNumberOrSpecial: boolean;
    };
    assert.equal(policyPayload.passwordMinLength, 16);
    assert.equal(policyPayload.passwordRequireNumberOrSpecial, false);

    const changeResponse = await request("/auth/password/change", {
      method: "POST",
      cookie: userCookie,
      body: {
        currentPassword: "ValidPassword1!",
        newPassword: "SixteenLettersPwd"
      }
    });
    assert.equal(changeResponse.status, 200);
  });

  it("rate limits password reset attempts per IP", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request("/auth/password/reset", {
        method: "POST",
        ip: "127.0.0.250",
        body: {
          token: "invalid-token",
          newPassword: "ValidPassword1!"
        }
      });
      assert.equal(response.status, 400);
    }

    const limitedResponse = await request("/auth/password/reset", {
      method: "POST",
      ip: "127.0.0.250",
      body: {
        token: "invalid-token",
        newPassword: "ValidPassword1!"
      }
    });
    assert.equal(limitedResponse.status, 429);
  });

  it("reset changes password and invalidates active sessions", async () => {
    await createUser("reset@example.com", "ValidPassword1!");

    const loginResponse = await request("/auth/login", {
      method: "POST",
      ip: "127.0.0.210",
      body: {
        email: "reset@example.com",
        password: "ValidPassword1!"
      }
    });

    const activeSessionCookie = extractSessionCookie(loginResponse.headers.get("set-cookie"));
    assert.ok(activeSessionCookie, "Expected active session cookie");

    const forgotResponse = await request("/auth/password/forgot", {
      method: "POST",
      ip: "127.0.0.211",
      body: {
        email: "reset@example.com"
      }
    });

    assert.equal(forgotResponse.status, 200);

    const notification = await waitForCapturedNotification("PASSWORD_RESET_LINK");
    const resetLink = String(notification.link ?? "");
    assert.ok(resetLink, "Expected reset link in notification payload");

    const url = new URL(resetLink);
    const token = url.searchParams.get("token");
    assert.ok(token, "Expected token in reset link");

    const storedToken = await prisma.passwordResetToken.findFirstOrThrow({
      where: {
        userId: (
          await prisma.user.findUniqueOrThrow({
            where: {
              email: "reset@example.com"
            }
          })
        ).id
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    assert.equal(storedToken.tokenHash, hashToken(token));
    assert.notEqual(storedToken.tokenHash, token);

    const secondActiveToken = await prisma.passwordResetToken.create({
      data: {
        userId: storedToken.userId,
        tokenHash: hashToken("second-active-reset-token"),
        expiresAt: new Date(Date.now() + 60 * 60_000)
      }
    });

    const resetResponse = await request("/auth/password/reset", {
      method: "POST",
      ip: "127.0.0.212",
      body: {
        token,
        newPassword: "EvenBetterPassword2!"
      }
    });

    assert.equal(resetResponse.status, 200);

    const secondActiveTokenAfter = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: secondActiveToken.id
      }
    });
    assert.ok(secondActiveTokenAfter.usedAt);

    const meAfterReset = await request("/auth/me", {
      cookie: activeSessionCookie
    });
    assert.equal(meAfterReset.status, 401);

    const oldPasswordLogin = await request("/auth/login", {
      method: "POST",
      ip: "127.0.0.213",
      body: {
        email: "reset@example.com",
        password: "ValidPassword1!"
      }
    });
    assert.equal(oldPasswordLogin.status, 401);

    const newPasswordLogin = await request("/auth/login", {
      method: "POST",
      ip: "127.0.0.214",
      body: {
        email: "reset@example.com",
        password: "EvenBetterPassword2!"
      }
    });
    assert.equal(newPasswordLogin.status, 200);
  });

  it("blocks external password reset links when external users are disabled", async () => {
    const admin = await createUser("external-reset-admin@example.com", "ValidPassword1!");
    const externalUser = await createUser("external-reset@example.com", "ValidPassword1!");
    await prisma.user.update({
      where: {
        id: externalUser.id
      },
      data: {
        role: "EXTERNAL",
        type: "EXTERNAL"
      }
    });

    const forgotResponse = await request("/auth/password/forgot", {
      method: "POST",
      ip: "127.0.0.215",
      body: {
        email: "external-reset@example.com"
      }
    });
    assert.equal(forgotResponse.status, 200);

    const notification = await waitForCapturedNotification("PASSWORD_RESET_LINK");
    const resetLink = String(notification.link ?? "");
    const token = new URL(resetLink).searchParams.get("token");
    assert.ok(token, "Expected token in reset link");

    const adminCookie = await loginWithPassword(admin.email, "ValidPassword1!", "127.0.0.216").then((response) =>
      extractSessionCookie(response.headers.get("set-cookie"))
    );
    assert.ok(adminCookie);

    const disableResponse = await request("/admin/security", {
      method: "PATCH",
      cookie: adminCookie,
      body: {
        allowExternalUsers: false
      }
    });
    assert.equal(disableResponse.status, 200);

    const resetResponse = await request("/auth/password/reset", {
      method: "POST",
      ip: "127.0.0.217",
      body: {
        token,
        newPassword: "ExternalResetPassword2!"
      }
    });
    assert.equal(resetResponse.status, 403);

    const activeTokens = await prisma.passwordResetToken.count({
      where: {
        userId: externalUser.id,
        usedAt: null
      }
    });
    assert.equal(activeTokens, 0);
  });

  it("consumes external reset tokens before password validation when external users are disabled", async () => {
    const admin = await createUser("external-invalid-reset-admin@example.com", "ValidPassword1!");
    const externalUser = await createUser("external-invalid-reset@example.com", "ValidPassword1!");
    await makeUserExternal(externalUser.id);

    const token = await requestResetToken("external-invalid-reset@example.com", "127.0.0.220");

    const adminCookie = await loginWithPassword(admin.email, "ValidPassword1!", "127.0.0.221").then((response) =>
      extractSessionCookie(response.headers.get("set-cookie"))
    );
    assert.ok(adminCookie);

    const disableResponse = await request("/admin/security", {
      method: "PATCH",
      cookie: adminCookie,
      body: {
        allowExternalUsers: false
      }
    });
    assert.equal(disableResponse.status, 200);

    const resetResponse = await request("/auth/password/reset", {
      method: "POST",
      ip: "127.0.0.222",
      body: {
        token,
        newPassword: "short"
      }
    });
    assert.equal(resetResponse.status, 403);
    const resetPayload = (await resetResponse.json()) as { message?: string };
    assert.equal(resetPayload.message, "External users are currently disabled.");

    const usedToken = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        tokenHash: hashToken(token)
      }
    });
    assert.ok(usedToken.usedAt, "Expected disabled external reset to consume token");

    const enableResponse = await request("/admin/security", {
      method: "PATCH",
      cookie: adminCookie,
      body: {
        allowExternalUsers: true
      }
    });
    assert.equal(enableResponse.status, 200);

    const retryResponse = await request("/auth/password/reset", {
      method: "POST",
      ip: "127.0.0.223",
      body: {
        token,
        newPassword: "ExternalResetPassword2!"
      }
    });
    assert.equal(retryResponse.status, 400);
    const retryPayload = (await retryResponse.json()) as { message?: string };
    assert.equal(retryPayload.message, "Invalid or expired reset token.");
  });

  it("keeps internal reset tokens usable after password policy errors", async () => {
    await createUser("internal-invalid-reset@example.com", "ValidPassword1!");
    const token = await requestResetToken("internal-invalid-reset@example.com", "127.0.0.224");

    const resetResponse = await request("/auth/password/reset", {
      method: "POST",
      ip: "127.0.0.225",
      body: {
        token,
        newPassword: "short"
      }
    });
    assert.equal(resetResponse.status, 400);
    const resetPayload = (await resetResponse.json()) as { message?: string };
    assert.match(resetPayload.message ?? "", /Password must be at least/);

    const activeToken = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        tokenHash: hashToken(token)
      }
    });
    assert.equal(activeToken.usedAt, null);

    const retryResponse = await request("/auth/password/reset", {
      method: "POST",
      ip: "127.0.0.226",
      body: {
        token,
        newPassword: "InternalResetPassword2!"
      }
    });
    assert.equal(retryResponse.status, 200);
  });

  it("allows external password reset links while external users are enabled", async () => {
    const externalUser = await createUser("external-enabled-reset@example.com", "ValidPassword1!");
    await makeUserExternal(externalUser.id);

    const token = await requestResetToken("external-enabled-reset@example.com", "127.0.0.227");
    const resetResponse = await request("/auth/password/reset", {
      method: "POST",
      ip: "127.0.0.228",
      body: {
        token,
        newPassword: "ExternalEnabledPassword2!"
      }
    });
    assert.equal(resetResponse.status, 200);

    const loginResponse = await request("/auth/login", {
      method: "POST",
      ip: "127.0.0.229",
      body: {
        email: "external-enabled-reset@example.com",
        password: "ExternalEnabledPassword2!"
      }
    });
    assert.equal(loginResponse.status, 200);
  });

  it("keeps archived users blocked during password reset", async () => {
    const user = await createUser("archived-reset-token@example.com", "ValidPassword1!");
    const token = await requestResetToken("archived-reset-token@example.com", "127.0.0.231");

    await prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        isArchived: true
      }
    });

    const resetResponse = await request("/auth/password/reset", {
      method: "POST",
      ip: "127.0.0.232",
      body: {
        token,
        newPassword: "ArchivedResetPassword2!"
      }
    });
    assert.equal(resetResponse.status, 400);
    const resetPayload = (await resetResponse.json()) as { message?: string };
    assert.equal(resetPayload.message, "Invalid or expired reset token.");
  });

  it("does not create new external reset tokens when external users are disabled", async () => {
    const admin = await createUser("external-forgot-admin@example.com", "ValidPassword1!");
    const externalUser = await createUser("external-forgot@example.com", "ValidPassword1!");
    await prisma.user.update({
      where: {
        id: externalUser.id
      },
      data: {
        role: "EXTERNAL",
        type: "EXTERNAL"
      }
    });

    const adminCookie = await loginWithPassword(admin.email, "ValidPassword1!", "127.0.0.218").then((response) =>
      extractSessionCookie(response.headers.get("set-cookie"))
    );
    assert.ok(adminCookie);

    const disableResponse = await request("/admin/security", {
      method: "PATCH",
      cookie: adminCookie,
      body: {
        allowExternalUsers: false
      }
    });
    assert.equal(disableResponse.status, 200);

    const forgotResponse = await request("/auth/password/forgot", {
      method: "POST",
      ip: "127.0.0.219",
      body: {
        email: "external-forgot@example.com"
      }
    });
    assert.equal(forgotResponse.status, 200);

    const tokenCount = await prisma.passwordResetToken.count({
      where: {
        userId: externalUser.id
      }
    });
    assert.equal(tokenCount, 0);
    assert.equal(capturedNotifications.some((entry) => entry.eventType === "PASSWORD_RESET_LINK"), false);
  });

  it("supports MFA setup, confirm and verify during login", async () => {
    await createUser("mfa-setup@example.com", "ValidPassword1!");

    const initialLogin = await loginWithPassword("mfa-setup@example.com", "ValidPassword1!");
    const initialCookie = extractSessionCookie(initialLogin.headers.get("set-cookie"));
    assert.ok(initialCookie, "Expected session cookie");

    const setupResponse = await request("/auth/mfa/totp/setup", {
      method: "POST",
      cookie: initialCookie
    });
    assert.equal(setupResponse.status, 200);
    const setupPayload = (await setupResponse.json()) as { otpauthUrl: string };
    const secret = readSecretFromOtpAuthUrl(setupPayload.otpauthUrl);
    const code = authenticator.generate(secret);

    const confirmResponse = await request("/auth/mfa/totp/confirm", {
      method: "POST",
      cookie: initialCookie,
      body: { code }
    });
    assert.equal(confirmResponse.status, 200);
    const confirmPayload = (await confirmResponse.json()) as { recoveryCodes: string[] };
    assert.equal(confirmPayload.recoveryCodes.length, 10);

    const challengeIp = "127.0.0.201";
    const mfaLogin = await loginWithPassword("mfa-setup@example.com", "ValidPassword1!", challengeIp);
    const mfaLoginPayload = (await mfaLogin.json()) as { ok: true; mfaRequired: true; mfaToken: string };
    assert.equal(mfaLoginPayload.mfaRequired, true);
    assert.ok(mfaLoginPayload.mfaToken);

    const verifyResponse = await request("/auth/mfa/verify", {
      method: "POST",
      ip: challengeIp,
      body: {
        mfaToken: mfaLoginPayload.mfaToken,
        codeOrRecovery: authenticator.generate(secret)
      }
    });
    assert.equal(verifyResponse.status, 200);

    const verifyCookie = extractSessionCookie(verifyResponse.headers.get("set-cookie"));
    assert.ok(verifyCookie, "Expected session cookie after MFA verify");

    const meResponse = await request("/auth/me", {
      cookie: verifyCookie
    });
    assert.equal(meResponse.status, 200);
  });

  it("disabling external users blocks MFA verification before session creation", async () => {
    const admin = await createUser("external-mfa-admin@example.com", "ValidPassword1!");
    const externalUser = await createUser("external-mfa-user@example.com", "ValidPassword1!");
    await prisma.user.update({
      where: {
        id: externalUser.id
      },
      data: {
        role: "EXTERNAL",
        type: "EXTERNAL",
        mfaEnforced: true
      }
    });

    const adminLogin = await loginWithPassword(admin.email, "ValidPassword1!");
    const adminCookie = extractSessionCookie(adminLogin.headers.get("set-cookie"));
    assert.ok(adminCookie);

    const mfaLogin = await loginWithPassword(externalUser.email, "ValidPassword1!", "127.0.0.204");
    const mfaLoginPayload = (await mfaLogin.json()) as { ok: true; mfaRequired: true; mfaToken: string };
    assert.equal(mfaLoginPayload.mfaRequired, true);

    const disableResponse = await request("/admin/security", {
      method: "PATCH",
      cookie: adminCookie,
      body: {
        allowExternalUsers: false
      }
    });
    assert.equal(disableResponse.status, 200);

    const verifyResponse = await request("/auth/mfa/verify", {
      method: "POST",
      ip: "127.0.0.204",
      body: {
        mfaToken: mfaLoginPayload.mfaToken,
        codeOrRecovery: "123456"
      }
    });
    assert.equal(verifyResponse.status, 401);
  });

  it("recovery code works only once", async () => {
    await createUser("mfa-recovery@example.com", "ValidPassword1!");

    const initialLogin = await loginWithPassword("mfa-recovery@example.com", "ValidPassword1!");
    const initialCookie = extractSessionCookie(initialLogin.headers.get("set-cookie"));
    assert.ok(initialCookie);

    const setupResponse = await request("/auth/mfa/totp/setup", {
      method: "POST",
      cookie: initialCookie
    });
    const setupPayload = (await setupResponse.json()) as { otpauthUrl: string };
    const secret = readSecretFromOtpAuthUrl(setupPayload.otpauthUrl);

    const confirmResponse = await request("/auth/mfa/totp/confirm", {
      method: "POST",
      cookie: initialCookie,
      body: { code: authenticator.generate(secret) }
    });
    const confirmPayload = (await confirmResponse.json()) as { recoveryCodes: string[] };
    const firstRecoveryCode = confirmPayload.recoveryCodes[0];
    assert.ok(firstRecoveryCode);

    const challengeOneIp = "127.0.0.202";
    const challengeOne = await loginWithPassword("mfa-recovery@example.com", "ValidPassword1!", challengeOneIp);
    const challengeOnePayload = (await challengeOne.json()) as { mfaToken: string };

    const firstRecoveryResponse = await request("/auth/mfa/verify", {
      method: "POST",
      ip: challengeOneIp,
      body: {
        mfaToken: challengeOnePayload.mfaToken,
        codeOrRecovery: firstRecoveryCode
      }
    });
    assert.equal(firstRecoveryResponse.status, 200);

    const challengeTwoIp = "127.0.0.203";
    const challengeTwo = await loginWithPassword("mfa-recovery@example.com", "ValidPassword1!", challengeTwoIp);
    const challengeTwoPayload = (await challengeTwo.json()) as { mfaToken: string };

    const secondRecoveryResponse = await request("/auth/mfa/verify", {
      method: "POST",
      ip: challengeTwoIp,
      body: {
        mfaToken: challengeTwoPayload.mfaToken,
        codeOrRecovery: firstRecoveryCode
      }
    });
    assert.equal(secondRecoveryResponse.status, 401);
  });

  it("mfaEnforced triggers mfaRequired on login", async () => {
    const user = await createUser("mfa-enforced@example.com", "ValidPassword1!");
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnforced: true }
    });

    const loginResponse = await loginWithPassword("mfa-enforced@example.com", "ValidPassword1!");
    const payload = (await loginResponse.json()) as { mfaRequired: boolean; mfaToken?: string };
    assert.equal(payload.mfaRequired, true);
    assert.ok(payload.mfaToken);
  });

  it("mfa disable removes requirement", async () => {
    await createUser("mfa-disable@example.com", "ValidPassword1!");

    const initialLogin = await loginWithPassword("mfa-disable@example.com", "ValidPassword1!");
    const initialCookie = extractSessionCookie(initialLogin.headers.get("set-cookie"));
    assert.ok(initialCookie);

    const setupResponse = await request("/auth/mfa/totp/setup", {
      method: "POST",
      cookie: initialCookie
    });
    const setupPayload = (await setupResponse.json()) as { otpauthUrl: string };
    const secret = readSecretFromOtpAuthUrl(setupPayload.otpauthUrl);

    const confirmResponse = await request("/auth/mfa/totp/confirm", {
      method: "POST",
      cookie: initialCookie,
      body: { code: authenticator.generate(secret) }
    });
    assert.equal(confirmResponse.status, 200);

    const disableResponse = await request("/auth/mfa/totp/disable", {
      method: "POST",
      cookie: initialCookie,
      body: { code: authenticator.generate(secret) }
    });
    assert.equal(disableResponse.status, 200);

    const loginAfterDisable = await loginWithPassword("mfa-disable@example.com", "ValidPassword1!");
    const payload = (await loginAfterDisable.json()) as { user?: { email: string }; mfaRequired?: boolean };
    assert.equal(Boolean(payload.user), true);
    assert.equal(payload.mfaRequired, undefined);
  });

  it("rate limits mfa verify attempts per IP", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await request("/auth/mfa/verify", {
        method: "POST",
        ip: "127.0.0.251",
        body: {
          mfaToken: "invalid",
          codeOrRecovery: "invalid"
        }
      });
      assert.equal(response.status, 401);
    }

    const limitedResponse = await request("/auth/mfa/verify", {
      method: "POST",
      ip: "127.0.0.251",
      body: {
        mfaToken: "invalid",
        codeOrRecovery: "invalid"
      }
    });
    assert.equal(limitedResponse.status, 429);
  });
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { authenticator } from "otplib";
import { createApp } from "./app.js";
import { resolveDatabaseUrl, type AppConfig } from "./config.js";
import { prisma } from "./prisma.js";
import { hashPassword } from "./security.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const outboxDir = path.resolve(currentDir, "..", "storage", "mail-outbox");

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;

async function cleanOutbox() {
  await fs.mkdir(outboxDir, { recursive: true });
  const files = await fs.readdir(outboxDir);
  await Promise.all(files.map((file) => fs.rm(path.resolve(outboxDir, file), { force: true })));
}

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

async function getResetTokenFromOutbox() {
  const files = (await fs.readdir(outboxDir)).sort();
  const latest = files.at(-1);
  assert.ok(latest, "Expected reset outbox entry");
  const content = await fs.readFile(path.resolve(outboxDir, latest), "utf8");
  const parsed = JSON.parse(content) as { resetLink?: string };
  assert.ok(parsed.resetLink, "Reset link missing");

  const url = new URL(parsed.resetLink);
  const token = url.searchParams.get("token");
  assert.ok(token, "Token missing in reset link");
  return token;
}

function readSecretFromOtpAuthUrl(otpauthUrl: string) {
  const parsed = new URL(otpauthUrl);
  const secret = parsed.searchParams.get("secret");
  assert.ok(secret, "Expected secret in otpauth URL");
  return secret;
}

async function loginWithPassword(email: string, password: string, ip?: string) {
  const response = await request("/auth/login", {
    method: "POST",
    ip: ip ?? `127.0.0.${Math.floor(Math.random() * 200) + 1}`,
    body: {
      email,
      password
    }
  });

  assert.equal(response.status, 200);
  return response;
}

describe("Auth API", () => {
  before(async () => {
    const config: AppConfig = {
      port: 0,
      databaseUrl: resolveDatabaseUrl(process.env, "test"),
      appOrigin: "http://localhost:5173",
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
    await prisma.passwordResetToken.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await cleanOutbox();
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

    const token = await getResetTokenFromOutbox();

    const resetResponse = await request("/auth/password/reset", {
      method: "POST",
      ip: "127.0.0.212",
      body: {
        token,
        newPassword: "EvenBetterPassword2!"
      }
    });

    assert.equal(resetResponse.status, 200);

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

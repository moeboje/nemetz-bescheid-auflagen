import argon2 from "argon2";
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const PASSWORD_MIN_LENGTH = 12;

export type PasswordPolicy = {
  minLength: number;
  requireNumberOrSpecial: boolean;
};

export type PasswordValidationResult = {
  valid: boolean;
  message?: string;
};

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    timeCost: 3,
    memoryCost: 65536,
    parallelism: 1
  });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function validatePassword(password: string, policy: Partial<PasswordPolicy> = {}): PasswordValidationResult {
  const normalized = password.trim();
  const minLength = Math.max(policy.minLength ?? PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH);
  const requireNumberOrSpecial = policy.requireNumberOrSpecial ?? true;

  if (normalized.length < minLength) {
    return {
      valid: false,
      message: `Password must be at least ${minLength} characters long.`
    };
  }

  if (requireNumberOrSpecial && !/[0-9]|[^A-Za-z0-9]/.test(normalized)) {
    return {
      valid: false,
      message: "Password must include at least one number or special character."
    };
  }

  return { valid: true };
}

export function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

const ENCRYPTION_VERSION = "v1";
const ENCRYPTION_SALT = "nemetz-mfa-aes-gcm";

function deriveEncryptionKey(secret: string) {
  return crypto.scryptSync(secret, ENCRYPTION_SALT, 32);
}

export function encryptString(plainText: string, secret: string) {
  const key = deriveEncryptionKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [ENCRYPTION_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(
    "."
  );
}

export function decryptString(payload: string, secret: string) {
  const [version, ivRaw, tagRaw, ciphertextRaw] = payload.split(".");

  if (version !== ENCRYPTION_VERSION || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("Invalid encrypted payload format.");
  }

  const key = deriveEncryptionKey(secret);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final()
  ]);

  return plain.toString("utf8");
}

export function parseCookies(headerValue: string | undefined) {
  const cookies = new Map<string, string>();
  if (!headerValue) {
    return cookies;
  }

  const rows = headerValue.split(";");
  rows.forEach((entry) => {
    const [rawName, ...rest] = entry.split("=");
    const name = rawName?.trim();
    if (!name) {
      return;
    }
    const value = rest.join("=").trim();
    cookies.set(name, decodeURIComponent(value));
  });

  return cookies;
}

export type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, RateBucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const key = `${options.keyPrefix}:${ip}`;

    const existing = buckets.get(key);
    if (!existing || now > existing.resetAt) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs
      });
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        ok: false,
        message: "Too many requests. Please try again later."
      });
      return;
    }

    existing.count += 1;
    buckets.set(key, existing);
    next();
  };
}

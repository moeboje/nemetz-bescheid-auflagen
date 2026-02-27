import crypto from "node:crypto";
import { authenticator } from "otplib";
import { hashToken } from "./security.js";

const MFA_ISSUER = "Nemetz";
const TOTP_WINDOW = 1;

authenticator.options = {
  ...authenticator.options,
  window: TOTP_WINDOW
};

export function generateTotpSecret() {
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(email: string, secret: string) {
  return authenticator.keyuri(email, MFA_ISSUER, secret);
}

export function normalizeTotpCode(value: string) {
  return value.replace(/\s+/g, "").trim();
}

export function verifyTotpCode(secret: string, code: string) {
  const normalized = normalizeTotpCode(code);
  if (!/^[0-9]{6}$/.test(normalized)) {
    return false;
  }
  return authenticator.check(normalized, secret);
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const head = crypto.randomBytes(3).toString("hex").toUpperCase();
    const tail = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `${head}-${tail}`;
  });
}

export function normalizeRecoveryCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function hashRecoveryCode(value: string) {
  return hashToken(normalizeRecoveryCode(value));
}

export function parseRecoveryHashJson(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export function useRecoveryCodeOnce(code: string, hashJson: string | null | undefined) {
  const hash = hashRecoveryCode(code);
  const hashes = parseRecoveryHashJson(hashJson);
  const index = hashes.indexOf(hash);
  if (index < 0) {
    return { matched: false as const, nextHashJson: hashJson ?? "[]" };
  }

  const next = [...hashes.slice(0, index), ...hashes.slice(index + 1)];
  return { matched: true as const, nextHashJson: JSON.stringify(next) };
}

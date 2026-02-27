import { generateOpaqueToken } from "./security.js";

export type EntraState = {
  nonce: string;
  expiresAt: number;
  returnTo?: string;
};

export function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

export function extractEmailFromClaims(claims: Record<string, unknown>) {
  const candidates = [claims.email, claims.preferred_username, claims.upn];
  for (const value of candidates) {
    if (typeof value === "string" && value.includes("@")) {
      return normalizeEmailAddress(value);
    }
  }
  return null;
}

export function isAllowedEmailDomain(email: string, allowedDomains: string[]) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const normalizedAllowed = allowedDomains.map((entry) => entry.toLowerCase());
  return normalizedAllowed.length === 0 ? true : normalizedAllowed.includes(domain);
}

export function createEntraStateStore() {
  const states = new Map<string, EntraState>();

  const purgeExpired = () => {
    const now = Date.now();
    for (const [key, value] of states) {
      if (value.expiresAt <= now) {
        states.delete(key);
      }
    }
  };

  return {
    issueState(input?: { ttlMs?: number; returnTo?: string }) {
      purgeExpired();
      const state = generateOpaqueToken(24);
      const nonce = generateOpaqueToken(24);
      states.set(state, {
        nonce,
        expiresAt: Date.now() + (input?.ttlMs ?? 10 * 60 * 1000),
        returnTo: input?.returnTo
      });
      return { state, nonce };
    },
    consumeState(state: string) {
      purgeExpired();
      const existing = states.get(state);
      if (!existing) {
        return null;
      }
      states.delete(state);
      return existing;
    }
  };
}

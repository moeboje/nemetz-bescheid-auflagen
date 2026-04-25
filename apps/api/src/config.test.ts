import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.js";

const STRONG_PRODUCTION_SESSION_SECRET = "F4X1w5vM7qR9tY2nB8kP3sD6hJ0cL!z_";
const STRONG_HEX_SESSION_SECRET = "4f8c2a91b7d34e56aa18cf029db73c4e";
const STRONG_BASE64URL_SESSION_SECRET = "X3mQ9vL2sP0aK8nT1cR7yU5eB6dF4hJ_2qW9zM1";
const STRONG_ALPHANUMERIC_SESSION_SECRET = "m7K2v9P4s8N3x6C1q5R0t2W4y7B9d1F3";

const PLACEHOLDER_PRODUCTION_SESSION_SECRETS = [
  "Replace-With-A-Long-Random-Secret",
  "dev-only-change-me"
];

const SHORT_PRODUCTION_SESSION_SECRETS = [
  "foo",
  "Nemetz"
];

const WEAK_PRODUCTION_SESSION_SECRETS = [
  {
    label: "repeated-character",
    value: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  {
    label: "repeated-digit-character",
    value: "11111111111111111111111111111111"
  },
  {
    label: "digits-only",
    value: "12345678901234567890123456789012"
  },
  {
    label: "repeated-short-mixed-pattern",
    value: "abc123abc123abc123abc123abc123ab"
  },
  {
    label: "repeated-short-pattern-with-remainder",
    value: "abcabcabcabcabcabcabcabcabcabcab"
  },
  {
    label: "repeated-short-pattern-with-variant-remainder",
    value: "xyzxyzxyzxyzxyzxyzxyzxyzxyzxyzxy"
  },
  {
    label: "repeated-longer-pattern",
    value: "abcdefghijabcdefghijabcdefghijab"
  },
  {
    label: "repeated-qwerty-pattern",
    value: "qwertyuiopqwertyuiopqwertyuiopqw"
  },
  {
    label: "very-low-diversity",
    value: "aaaabbbbccccddddaaaabbbbccccdddd"
  },
  {
    label: "monotone-alphabet-sequence",
    value: "abcdefghijklmnopqrstuvwxyzabcdef"
  },
  {
    label: "concatenated-alphabet-then-digits-sequence",
    value: "abcdefghijklmnopqrstuvwxyz012345"
  },
  {
    label: "concatenated-digits-then-alphabet-sequence",
    value: "0123456789abcdefghijklmnopqrstuvwxyz"
  },
  {
    label: "long-digit-sequence-with-alphabet-remainder",
    value: "012345678901234567890123456789ab"
  },
  {
    label: "long-digit-sequence-plus-second-sequence-segment",
    value: "01234567890123456789abcdefghijkl"
  },
  {
    label: "long-alphabet-sequence-with-weak-suffix",
    value: "abcdefghijklmnopqrstuvwxyzaaaaaa"
  },
  {
    label: "case-mixed-alphabet-sequence-with-digit-suffix",
    value: "AbCdEfGhIjKlMnOpQrStUvWxYz012345"
  }
];

const ACCEPTED_PRODUCTION_SESSION_SECRETS = [
  {
    label: "random-looking hex",
    value: STRONG_HEX_SESSION_SECRET
  },
  {
    label: "random-looking base64url",
    value: STRONG_BASE64URL_SESSION_SECRET
  },
  {
    label: "random-looking alphanumeric without punctuation",
    value: STRONG_ALPHANUMERIC_SESSION_SECRET
  }
];

const PRODUCTION_LOOPBACK_URLS = [
  "https://localhost",
  "https://foo.localhost",
  "https://bar.foo.localhost",
  "https://localhost.",
  "https://Foo.LocalHost",
  "https://127.0.0.1",
  "https://127.0.1.1",
  "https://[::1]",
  "https://[::ffff:7f00:1]"
];

function makeEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    PORT: "4000",
    DATABASE_URL: "postgresql://portal:portalpw@localhost:5433/portaldev?schema=public",
    APP_ORIGIN: "https://portal.example.test",
    BASE_PATH: "/api",
    DOCUMENTS_MAX_UPLOAD_MB: "20",
    ...overrides
  } as NodeJS.ProcessEnv;
}

describe("runtime config security validation", () => {
  it("rejects missing SESSION_SECRET in production", () => {
    assert.throws(
      () =>
        loadConfig(
          makeEnv({
            NODE_ENV: "production",
            SESSION_SECRET: undefined,
            COOKIE_SECURE: "true"
          })
        ),
      /SESSION_SECRET must be set/
    );
  });

  for (const sessionSecret of PLACEHOLDER_PRODUCTION_SESSION_SECRETS) {
    it(`rejects placeholder SESSION_SECRET value "${sessionSecret}" in production`, () => {
      assert.throws(
        () =>
          loadConfig(
            makeEnv({
              NODE_ENV: "production",
              SESSION_SECRET: sessionSecret,
              COOKIE_SECURE: "true"
            })
          ),
        /known placeholder/
      );
    });
  }

  for (const sessionSecret of SHORT_PRODUCTION_SESSION_SECRETS) {
    it(`rejects short non-placeholder SESSION_SECRET value "${sessionSecret}" in production`, () => {
      assert.throws(
        () =>
          loadConfig(
            makeEnv({
              NODE_ENV: "production",
              SESSION_SECRET: sessionSecret,
              COOKIE_SECURE: "true"
            })
          ),
        /at least 32 characters/
      );
    });
  }

  it("accepts a strong SESSION_SECRET in production", () => {
    const config = loadConfig(
      makeEnv({
        NODE_ENV: "production",
        SESSION_SECRET: STRONG_PRODUCTION_SESSION_SECRET,
        COOKIE_SECURE: "true"
      })
    );

    assert.equal(config.nodeEnv, "production");
    assert.equal(config.sessionSecret, STRONG_PRODUCTION_SESSION_SECRET);
    assert.equal(config.cookieSecure, true);
  });

  for (const { label, value } of WEAK_PRODUCTION_SESSION_SECRETS) {
    it(`rejects ${label} SESSION_SECRET values in production`, () => {
      assert.throws(
        () =>
          loadConfig(
            makeEnv({
              NODE_ENV: "production",
              SESSION_SECRET: value,
              COOKIE_SECURE: "true"
            })
          ),
        /obvious weak or pattern-based/
      );
    });
  }

  for (const { label, value } of ACCEPTED_PRODUCTION_SESSION_SECRETS) {
    it(`accepts ${label} SESSION_SECRET values in production`, () => {
      const config = loadConfig(
        makeEnv({
          NODE_ENV: "production",
          SESSION_SECRET: value,
          COOKIE_SECURE: "true"
        })
      );

      assert.equal(config.sessionSecret, value);
    });
  }

  it("rejects COOKIE_SECURE=false in production", () => {
    assert.throws(
      () =>
        loadConfig(
          makeEnv({
            NODE_ENV: "production",
            SESSION_SECRET: STRONG_PRODUCTION_SESSION_SECRET,
            COOKIE_SECURE: "false"
          })
        ),
      /COOKIE_SECURE must be true/
    );
  });

  it("keeps development usable with an explicit insecure cookie setting and fallback secret", () => {
    const config = loadConfig(
      makeEnv({
        NODE_ENV: "development",
        COOKIE_SECURE: "false",
        SESSION_SECRET: ""
      })
    );

    assert.equal(config.nodeEnv, "development");
    assert.equal(config.cookieSecure, false);
    assert.equal(config.sessionSecret, "dev-only-change-me");
  });

  it("rejects a missing APP_ORIGIN in production even when NOTIFICATION_BASE_URL is valid", () => {
    assert.throws(
      () =>
        loadConfig(
          makeEnv({
            NODE_ENV: "production",
            SESSION_SECRET: STRONG_PRODUCTION_SESSION_SECRET,
            COOKIE_SECURE: "true",
            APP_ORIGIN: undefined,
            NOTIFICATION_BASE_URL: "https://portal.example.test"
          })
        ),
      /APP_ORIGIN must be explicitly set/
    );
  });

  for (const loopbackUrl of PRODUCTION_LOOPBACK_URLS) {
    it(`rejects loopback APP_ORIGIN values in production: ${loopbackUrl}`, () => {
      assert.throws(
        () =>
          loadConfig(
            makeEnv({
              NODE_ENV: "production",
              SESSION_SECRET: STRONG_PRODUCTION_SESSION_SECRET,
              COOKIE_SECURE: "true",
              APP_ORIGIN: loopbackUrl,
              NOTIFICATION_BASE_URL: "https://portal.example.test"
            })
          ),
        /must not point to localhost or any loopback address/
      );
    });
  }

  it("rejects non-HTTPS APP_ORIGIN values in production", () => {
    assert.throws(
      () =>
        loadConfig(
          makeEnv({
            NODE_ENV: "production",
            SESSION_SECRET: STRONG_PRODUCTION_SESSION_SECRET,
            COOKIE_SECURE: "true",
            APP_ORIGIN: "http://portal.example.test",
            NOTIFICATION_BASE_URL: "https://portal.example.test"
          })
        ),
      /APP_ORIGIN must use HTTPS/
    );
  });

  it("uses APP_ORIGIN as the notification base when NOTIFICATION_BASE_URL is unset in production", () => {
    const config = loadConfig(
      makeEnv({
        NODE_ENV: "production",
        SESSION_SECRET: STRONG_PRODUCTION_SESSION_SECRET,
        COOKIE_SECURE: "true",
        APP_ORIGIN: "https://portal.example.test/",
        NOTIFICATION_BASE_URL: undefined
      })
    );

    assert.equal(config.appOrigin, "https://portal.example.test");
    assert.equal(config.notificationBaseUrl, "https://portal.example.test");
  });

  for (const loopbackUrl of PRODUCTION_LOOPBACK_URLS) {
    it(`rejects loopback notification bases in production even when APP_ORIGIN is valid: ${loopbackUrl}`, () => {
      assert.throws(
        () =>
          loadConfig(
            makeEnv({
              NODE_ENV: "production",
              SESSION_SECRET: STRONG_PRODUCTION_SESSION_SECRET,
              COOKIE_SECURE: "true",
              APP_ORIGIN: "https://portal.example.test",
              NOTIFICATION_BASE_URL: loopbackUrl
            })
          ),
        /NOTIFICATION_BASE_URL must not point to localhost or any loopback address/
      );
    });
  }

  it("rejects non-HTTPS notification bases in production", () => {
    assert.throws(
      () =>
        loadConfig(
          makeEnv({
            NODE_ENV: "production",
            SESSION_SECRET: STRONG_PRODUCTION_SESSION_SECRET,
            COOKIE_SECURE: "true",
            APP_ORIGIN: "https://portal.example.test",
            NOTIFICATION_BASE_URL: "http://portal.example.test"
          })
        ),
      /NOTIFICATION_BASE_URL must use HTTPS/
    );
  });

  it("accepts a valid explicit HTTPS notification base in production", () => {
    const config = loadConfig(
      makeEnv({
        NODE_ENV: "production",
        SESSION_SECRET: STRONG_PRODUCTION_SESSION_SECRET,
        COOKIE_SECURE: "true",
        APP_ORIGIN: "https://portal.example.test",
        NOTIFICATION_BASE_URL: "https://portal.example.test/"
      })
    );

    assert.equal(config.appOrigin, "https://portal.example.test");
    assert.equal(config.notificationBaseUrl, "https://portal.example.test");
  });

  it("keeps localhost notification bases valid in development for local Docker and browser flows", () => {
    const config = loadConfig(
      makeEnv({
        NODE_ENV: "development",
        APP_ORIGIN: "http://localhost:8080",
        NOTIFICATION_BASE_URL: "http://localhost:8080",
        COOKIE_SECURE: "false"
      })
    );

    assert.equal(config.appOrigin, "http://localhost:8080");
    assert.equal(config.notificationBaseUrl, "http://localhost:8080");
  });

  it("keeps localhost subdomains valid in development for local-only host flows", () => {
    const config = loadConfig(
      makeEnv({
        NODE_ENV: "development",
        APP_ORIGIN: "http://foo.localhost:8080",
        NOTIFICATION_BASE_URL: "http://bar.foo.localhost:8080",
        COOKIE_SECURE: "false"
      })
    );

    assert.equal(config.appOrigin, "http://foo.localhost:8080");
    assert.equal(config.notificationBaseUrl, "http://bar.foo.localhost:8080");
  });
});

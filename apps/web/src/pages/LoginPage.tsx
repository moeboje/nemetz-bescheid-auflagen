import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Input } from "@nemetz/ui";
import { t } from "../i18n";
import { ApiError } from "../api/client";
import { getEntraStatus } from "../api/auth";
import { resolveApiUrl } from "../api/client";
import { useAuth } from "../state/AuthStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [entraEnabled, setEntraEnabled] = useState(false);

  const nextPath =
    typeof (location.state as { from?: string } | null)?.from === "string"
      ? ((location.state as { from?: string }).from ?? "/compliance/dashboard")
      : "/compliance/dashboard";

  const oidcError = useMemo(() => {
    const value = new URLSearchParams(location.search).get("oidcError");
    if (!value) {
      return "";
    }
    return "Microsoft-Anmeldung fehlgeschlagen. Bitte erneut versuchen.";
  }, [location.search]);

  useEffect(() => {
    void getEntraStatus()
      .then((payload) => setEntraEnabled(payload.enabled))
      .catch(() => setEntraEnabled(false));
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError(t("auth.login.error.required"));
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const result = await login(email.trim(), password);
      if (result.mfaRequired) {
        navigate("/mfa", {
          replace: true,
          state: {
            mfaToken: result.mfaToken,
            nextPath
          }
        });
        return;
      }
      if (result.user.mustChangePassword) {
        navigate("/compliance/account/security?mode=force-password-change", { replace: true });
        return;
      }
      navigate(nextPath, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError(t("auth.login.error.locked"));
        } else {
          setError(t("auth.login.error.invalid"));
        }
      } else {
        setError(t("auth.login.error.generic"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="authPage">
      <Card>
        <form className="authForm" onSubmit={handleSubmit}>
          <h1 className="pageTitle">{t("auth.login.title")}</h1>
          <p className="placeholderText">{t("auth.login.subtitle")}</p>

          <div className="formField">
            <span className="fieldLabel">{t("auth.login.email")}</span>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.login.email")}
              disabled={isSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("auth.login.password")}</span>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.login.password")}
              disabled={isSubmitting}
            />
          </div>

          {oidcError ? <p className="validationText">{oidcError}</p> : null}
          {error ? <p className="validationText">{error}</p> : null}

          <div className="authActions">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
            </Button>
            {entraEnabled ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  window.location.assign(
                    resolveApiUrl(`/auth/entra/start?returnTo=${encodeURIComponent(nextPath)}`)
                  );
                }}
              >
                Mit Microsoft anmelden
              </Button>
            ) : null}
            <Link to="/forgot-password" className="authLink">
              {t("auth.login.forgot")}
            </Link>
            <Link to="/help/auth#security-login-password-mfa" className="authLink">
              Hilfe zu Login & MFA
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

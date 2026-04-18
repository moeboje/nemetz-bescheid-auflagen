import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Input } from "@nemetz/ui";
import { t } from "../i18n";
import { ApiError } from "../api/client";
import { useAuth } from "../state/AuthStore";

function isStrongPassword(value: string) {
  if (value.length < 12) {
    return false;
  }
  return /[0-9]|[^A-Za-z0-9]/.test(value);
}

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setError(t("auth.reset.error.tokenMissing"));
      return;
    }

    if (!isStrongPassword(newPassword)) {
      setError(t("auth.reset.error.weak"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t("auth.reset.error.mismatch"));
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await resetPassword(token, newPassword);
      setSubmitted(true);
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1200);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
        setError(t("auth.reset.error.invalidToken"));
      } else {
        setError(t("auth.reset.error.generic"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="authPage">
      <Card>
        <form className="authForm" onSubmit={handleSubmit}>
          <h1 className="pageTitle">{t("auth.reset.title")}</h1>
          <p className="placeholderText">{t("auth.reset.subtitle")}</p>

          <div className="formField">
            <span className="fieldLabel">{t("auth.reset.newPassword")}</span>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={t("auth.reset.newPassword")}
              disabled={isSubmitting || submitted}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("auth.reset.confirmPassword")}</span>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={t("auth.reset.confirmPassword")}
              disabled={isSubmitting || submitted}
            />
          </div>

          {error ? <p className="validationText">{error}</p> : null}
          {submitted ? <p className="placeholderText">{t("auth.reset.success")}</p> : null}

          <div className="authActions">
            <Button type="submit" disabled={isSubmitting || submitted}>
              {isSubmitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
            </Button>
            <Link to="/login" className="authLink">
              {t("auth.backToLogin")}
            </Link>
            <Link to="/help/auth#security-login-password-mfa" className="authLink">
              Hilfe zu Passwort & MFA
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

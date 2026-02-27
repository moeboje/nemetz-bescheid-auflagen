import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Input } from "@nemetz/ui";
import { t } from "../i18n";
import { useAuth } from "../state/AuthStore";

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await forgotPassword(email.trim());
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="authPage">
      <Card>
        <form className="authForm" onSubmit={handleSubmit}>
          <h1 className="pageTitle">{t("auth.forgot.title")}</h1>
          <p className="placeholderText">{t("auth.forgot.subtitle")}</p>

          <div className="formField">
            <span className="fieldLabel">{t("auth.forgot.email")}</span>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.forgot.email")}
              disabled={isSubmitting}
            />
          </div>

          {submitted ? <p className="placeholderText">{t("auth.forgot.success")}</p> : null}

          <div className="authActions">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
            </Button>
            <Link to="/login" className="authLink">
              {t("auth.backToLogin")}
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

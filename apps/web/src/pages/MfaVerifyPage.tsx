import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Input } from "@nemetz/ui";
import { ApiError } from "../api/client";
import { useAuth } from "../state/AuthStore";

type MfaLocationState = {
  mfaToken?: string;
  nextPath?: string;
};

const DEFAULT_NEXT_PATH = "/compliance/dashboard";

export default function MfaVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyMfa } = useAuth();
  const [value, setValue] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const state = (location.state as MfaLocationState | null) ?? {};
  const mfaToken = state.mfaToken ?? "";
  const nextPath = state.nextPath ?? DEFAULT_NEXT_PATH;

  const fieldLabel = useMemo(() => (useRecoveryCode ? "Recovery-Code" : "6-stelliger Authenticator-Code"), [useRecoveryCode]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mfaToken) {
      setError("MFA-Sitzung ist abgelaufen. Bitte erneut anmelden.");
      return;
    }

    if (!value.trim()) {
      setError("Code ist erforderlich.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const user = await verifyMfa(mfaToken, value.trim());
      if (user.mustChangePassword) {
        navigate("/compliance/settings/security?mode=force-password-change", { replace: true });
        return;
      }
      navigate(nextPath, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "MFA-Verifizierung fehlgeschlagen.");
      } else {
        setError("MFA-Verifizierung fehlgeschlagen.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="authPage">
      <Card>
        <form className="authForm" onSubmit={handleSubmit}>
          <h1 className="pageTitle">MFA bestätigen</h1>
          <p className="placeholderText">Bitte geben Sie Ihren Authenticator-Code oder Recovery-Code ein.</p>

          <label className="checkboxField">
            <input
              type="checkbox"
              checked={useRecoveryCode}
              onChange={(event) => {
                setUseRecoveryCode(event.target.checked);
                setValue("");
              }}
              disabled={isSubmitting}
            />
            <span>Recovery-Code verwenden</span>
          </label>

          <div className="formField">
            <span className="fieldLabel">{fieldLabel}</span>
            <Input
              value={value}
              autoComplete="one-time-code"
              onChange={(event) => setValue(event.target.value)}
              placeholder={fieldLabel}
              disabled={isSubmitting}
            />
          </div>

          {error ? <p className="validationText">{error}</p> : null}

          <div className="authActions">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Prüfe..." : "Bestätigen"}
            </Button>
            <Link to="/login" className="authLink">
              Zurück zum Login
            </Link>
            <Link to="/help/auth#security-login-password-mfa" className="authLink">
              Hilfe zu MFA & Recovery-Code
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

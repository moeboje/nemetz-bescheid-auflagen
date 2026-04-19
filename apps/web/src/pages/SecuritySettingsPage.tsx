import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Input, Select } from "@nemetz/ui";
import { ApiError } from "../api/client";
import {
  confirmMfaTotp,
  disableMfaTotp,
  getMfaStatus,
  getPasswordPolicy,
  setupMfaTotp,
  type MfaStatus,
  type PasswordPolicy
} from "../api/auth";
import HelpHintCard from "../components/HelpHintCard";
import { HELP_CONTEXT_SLUGS, getHelpHref } from "../help/helpContent";
import { useAuth } from "../state/AuthStore";

type DisableMethod = "code" | "recovery" | "password";

const defaultStatus: MfaStatus = {
  enabled: false,
  enforced: false
};

function getPasswordPolicyErrorMessage(password: string, policy: PasswordPolicy | null) {
  if (!policy) {
    return "";
  }

  const normalizedPassword = password.trim();
  if (normalizedPassword.length < policy.passwordMinLength) {
    return `Das neue Passwort muss mindestens ${policy.passwordMinLength} Zeichen lang sein.`;
  }

  if (policy.passwordRequireNumberOrSpecial && !/[0-9]|[^A-Za-z0-9]/.test(normalizedPassword)) {
    return "Das neue Passwort muss eine Zahl oder ein Sonderzeichen enthalten.";
  }

  return "";
}

export default function SecuritySettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { changePassword } = useAuth();
  const [status, setStatus] = useState<MfaStatus>(defaultStatus);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  const [setupUrl, setSetupUrl] = useState("");
  const [setupExpiresAt, setSetupExpiresAt] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [isSetupSubmitting, setIsSetupSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const [disableMethod, setDisableMethod] = useState<DisableMethod>("code");
  const [disableValue, setDisableValue] = useState("");
  const [isDisableSubmitting, setIsDisableSubmitting] = useState(false);
  const forcePasswordChange = searchParams.get("mode") === "force-password-change";

  const setupExpiryText = useMemo(() => {
    if (!setupExpiresAt) {
      return "";
    }

    const parsed = new Date(setupExpiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return parsed.toLocaleString("de-AT");
  }, [setupExpiresAt]);

  const loadStatus = async () => {
    setIsLoading(true);
    setError("");

    try {
      const next = await getMfaStatus();
      setStatus(next);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("MFA-Status konnte nicht geladen werden.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    let isMounted = true;

    void getPasswordPolicy()
      .then((policy) => {
        if (isMounted) {
          setPasswordPolicy(policy);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPasswordPolicy(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handlePasswordChange = async () => {
    if (!currentPassword.trim() || !newPassword || !confirmPassword) {
      setError("Bitte aktuelles Passwort, neues Passwort und Bestaetigung eingeben.");
      return;
    }

    const passwordPolicyError = getPasswordPolicyErrorMessage(newPassword, passwordPolicy);
    if (passwordPolicyError) {
      setError(passwordPolicyError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwoerter stimmen nicht ueberein.");
      return;
    }

    setIsPasswordSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await changePassword(currentPassword.trim(), newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(forcePasswordChange ? "Passwort geaendert. Weiterleitung ins Portal..." : "Passwort erfolgreich geaendert.");
      if (forcePasswordChange) {
        window.setTimeout(() => {
          navigate("/compliance/dashboard", { replace: true });
        }, 900);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Passwort konnte nicht geaendert werden.");
      }
    } finally {
      setIsPasswordSubmitting(false);
    }
  };

  const handleStartSetup = async () => {
    setIsSetupSubmitting(true);
    setError("");
    setSuccess("");
    setRecoveryCodes([]);

    try {
      const payload = await setupMfaTotp();
      setSetupUrl(payload.otpauthUrl);
      setSetupExpiresAt(payload.expiresAt);
      setSuccess("TOTP-Setup gestartet. Scannen Sie den otpauth-Link in Microsoft Authenticator.");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("TOTP-Setup konnte nicht gestartet werden.");
      }
    } finally {
      setIsSetupSubmitting(false);
    }
  };

  const handleConfirmSetup = async () => {
    if (!setupCode.trim()) {
      setError("Bitte geben Sie einen 6-stelligen Code ein.");
      return;
    }

    setIsSetupSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const payload = await confirmMfaTotp(setupCode.trim());
      setRecoveryCodes(payload.recoveryCodes);
      setSetupCode("");
      setSetupUrl("");
      setSetupExpiresAt("");
      setSuccess("MFA aktiviert. Speichern Sie die Recovery-Codes jetzt einmalig.");
      await loadStatus();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("MFA konnte nicht bestätigt werden.");
      }
    } finally {
      setIsSetupSubmitting(false);
    }
  };

  const handleDisable = async () => {
    if (!disableValue.trim()) {
      setError("Bitte geben Sie einen Wert zur Bestätigung ein.");
      return;
    }

    setIsDisableSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await disableMfaTotp(
        disableMethod === "code"
          ? { code: disableValue.trim() }
          : disableMethod === "recovery"
            ? { recoveryCode: disableValue.trim() }
            : { password: disableValue.trim() }
      );
      setDisableValue("");
      setRecoveryCodes([]);
      setSuccess("MFA deaktiviert.");
      await loadStatus();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("MFA konnte nicht deaktiviert werden.");
      }
    } finally {
      setIsDisableSubmitting(false);
    }
  };

  const copyRecoveryCodes = async () => {
    if (recoveryCodes.length === 0 || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setSuccess("Recovery-Codes in die Zwischenablage kopiert.");
    } catch {
      setError("Recovery-Codes konnten nicht kopiert werden.");
    }
  };

  return (
    <div className="page">
      <div className="pageHeader">
        <h1 className="pageTitle">Kontosicherheit</h1>
      </div>

      <HelpHintCard
        hintId="hint.securitySettings"
        title="Passwort, MFA und Recovery-Codes"
        bullets={[
          "Das eigene Passwort bleibt fuer alle Benutzer ausserhalb des Admin-Bereichs erreichbar.",
          "Recovery-Codes sind fuer Notfaelle gedacht und sollten getrennt vom Alltagsgeraet aufbewahrt werden.",
          "Passwort-Reset, MFA-Setup und MFA-Deaktivierung sind unterschiedliche Prozesse.",
          "Wenn Codes oder Links abgelaufen sind, starten Sie den jeweiligen Vorgang bewusst neu."
        ]}
        link={{
          label: "Passenden Hilfeartikel oeffnen",
          to: getHelpHref(HELP_CONTEXT_SLUGS.security)
        }}
      />

      {forcePasswordChange ? (
        <Card>
          <p className="validationText">
            Fuer dieses Konto ist ein Passwortwechsel erforderlich, bevor das Portal weiter genutzt werden kann.
          </p>
        </Card>
      ) : null}

      <Card>
        <h2 className="sectionTitle">Eigenes Passwort aendern</h2>
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">Aktuelles Passwort</span>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={isPasswordSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">Neues Passwort</span>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={isPasswordSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">Neues Passwort bestaetigen</span>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={isPasswordSubmitting}
            />
          </div>

          <Button onClick={() => void handlePasswordChange()} disabled={isPasswordSubmitting}>
            {isPasswordSubmitting ? "Speichere..." : "Passwort aendern"}
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <Card>
          <p className="placeholderText">MFA-Status wird geladen...</p>
        </Card>
      ) : null}

      {!isLoading ? (
        <Card>
          <p className="placeholderText">MFA aktiviert: {status.enabled ? "Ja" : "Nein"}</p>
          <p className="placeholderText">MFA erzwungen: {status.enforced ? "Ja" : "Nein"}</p>
          {status.verifiedAt ? <p className="placeholderText">Zuletzt bestätigt: {new Date(status.verifiedAt).toLocaleString("de-AT")}</p> : null}
        </Card>
      ) : null}

      {!status.enabled ? (
        <Card>
          <div className="modalForm">
            <Button onClick={() => void handleStartSetup()} disabled={isSetupSubmitting}>
              {isSetupSubmitting ? "Starte..." : "TOTP einrichten"}
            </Button>

            {setupUrl ? (
              <>
                <div className="formField">
                  <span className="fieldLabel">otpauth URL</span>
                  <Input value={setupUrl} disabled />
                </div>
                {setupExpiryText ? <p className="placeholderText">Ablauf: {setupExpiryText}</p> : null}
                <div className="formField">
                  <span className="fieldLabel">6-stelliger Code</span>
                  <Input
                    value={setupCode}
                    onChange={(event) => setSetupCode(event.target.value)}
                    placeholder="123456"
                    disabled={isSetupSubmitting}
                  />
                </div>
                <Button onClick={() => void handleConfirmSetup()} disabled={isSetupSubmitting}>
                  {isSetupSubmitting ? "Bestätige..." : "MFA aktivieren"}
                </Button>
              </>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="modalForm">
            {status.enforced ? (
              <p className="placeholderText">MFA ist für Ihr Konto erzwungen und kann nicht selbst deaktiviert werden.</p>
            ) : (
              <>
                <div className="formField">
                  <span className="fieldLabel">Deaktivierungsmethode</span>
                  <Select
                    options={[
                      { value: "code", label: "Authenticator-Code" },
                      { value: "recovery", label: "Recovery-Code" },
                      { value: "password", label: "Passwort" }
                    ]}
                    value={disableMethod}
                    onChange={(event) => {
                      setDisableMethod(event.target.value as DisableMethod);
                      setDisableValue("");
                    }}
                  />
                </div>

                <div className="formField">
                  <span className="fieldLabel">
                    {disableMethod === "code"
                      ? "Authenticator-Code"
                      : disableMethod === "recovery"
                        ? "Recovery-Code"
                        : "Passwort"}
                  </span>
                  <Input
                    type={disableMethod === "password" ? "password" : "text"}
                    value={disableValue}
                    onChange={(event) => setDisableValue(event.target.value)}
                    disabled={isDisableSubmitting}
                  />
                </div>

                <Button onClick={() => void handleDisable()} disabled={isDisableSubmitting}>
                  {isDisableSubmitting ? "Deaktiviere..." : "MFA deaktivieren"}
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {recoveryCodes.length > 0 ? (
        <Card>
          <h2 className="sectionTitle">Recovery-Codes (nur einmal sichtbar)</h2>
          <pre className="textarea">{recoveryCodes.join("\n")}</pre>
          <Button size="sm" variant="secondary" onClick={() => void copyRecoveryCodes()}>
            Recovery-Codes kopieren
          </Button>
        </Card>
      ) : null}

      {success ? (
        <Card>
          <p className="placeholderText">{success}</p>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <p className="validationText">{error}</p>
        </Card>
      ) : null}
    </div>
  );
}

import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, IconButton } from "@nemetz/ui";
import { t, type I18nKey } from "../i18n";
import { useHelpHints } from "../state/HelpHintsStore";

type HelpHintLink = {
  labelKey: I18nKey;
  to: string;
};

type HelpHintCardProps = {
  hintId: string;
  titleKey: I18nKey;
  bulletsKeys: I18nKey[];
  link?: HelpHintLink;
  dismissible?: boolean;
  onDismiss?: () => void;
};

export default function HelpHintCard({
  hintId,
  titleKey,
  bulletsKeys,
  link,
  dismissible = true,
  onDismiss
}: HelpHintCardProps) {
  const navigate = useNavigate();
  const { dismiss, isDismissed } = useHelpHints();

  if (dismissible && isDismissed(hintId)) {
    return null;
  }

  const handleDismiss = () => {
    dismiss(hintId);
    onDismiss?.();
  };

  return (
    <Card>
      <div className="helpHintCard">
        <div className="helpHintHeader">
          <h2 className="sectionTitle helpHintTitle">{t(titleKey)}</h2>
          {dismissible ? (
            <div className="helpHintDismissButton">
              <IconButton ariaLabel={t("help.hints.dismiss")} onClick={handleDismiss}>
                <span aria-hidden="true" className="helpHintDismissGlyph">
                  ×
                </span>
              </IconButton>
            </div>
          ) : null}
        </div>
        <ul className="helpHintList">
          {bulletsKeys.map((key) => (
            <li key={key} className="placeholderText">
              {t(key)}
            </li>
          ))}
        </ul>
        {link ? (
          <Button size="sm" variant="ghost" onClick={() => navigate(link.to)}>
            {t(link.labelKey)}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

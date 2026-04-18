import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, IconButton } from "@nemetz/ui";
import { t, type I18nKey } from "../i18n";
import { useHelpHints } from "../state/HelpHintsStore";

type HelpHintLink = {
  labelKey?: I18nKey;
  label?: string;
  to: string;
};

type HelpHintCardProps = {
  hintId: string;
  titleKey?: I18nKey;
  title?: string;
  bulletsKeys?: I18nKey[];
  bullets?: string[];
  link?: HelpHintLink;
  dismissible?: boolean;
  onDismiss?: () => void;
};

export default function HelpHintCard({
  hintId,
  titleKey,
  title,
  bulletsKeys = [],
  bullets = [],
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

  const resolvedTitle = titleKey ? t(titleKey) : title ?? "";
  const resolvedBullets = [
    ...bulletsKeys.map((key) => t(key)),
    ...bullets
  ].filter(Boolean);
  const resolvedLinkLabel = link?.labelKey ? t(link.labelKey) : link?.label ?? "";

  return (
    <Card>
      <div className="helpHintCard">
        <div className="helpHintHeader">
          <h2 className="sectionTitle helpHintTitle">{resolvedTitle}</h2>
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
          {resolvedBullets.map((bullet) => (
            <li key={bullet} className="placeholderText">
              {bullet}
            </li>
          ))}
        </ul>
        {link && resolvedLinkLabel ? (
          <Button size="sm" variant="ghost" onClick={() => navigate(link.to)}>
            {resolvedLinkLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

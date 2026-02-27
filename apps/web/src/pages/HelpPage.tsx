import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Breadcrumbs, Button, Card, Input, Modal } from "@nemetz/ui";
import { t } from "../i18n";
import { HELP_SECTIONS, type HelpSection } from "../help/helpContent";
import { useHelpHints } from "../state/HelpHintsStore";

function getSectionSearchValues(section: HelpSection) {
  const keys = [
    section.id,
    section.titleKey,
    section.descriptionKey,
    ...(section.steps ?? []).flatMap((step) => [step.titleKey, step.bodyKey]),
    ...(section.links ?? []).map((link) => link.labelKey)
  ].filter(Boolean) as string[];

  const localized = [
    t(section.titleKey),
    section.descriptionKey ? t(section.descriptionKey) : "",
    ...(section.steps ?? []).flatMap((step) => [t(step.titleKey), t(step.bodyKey)]),
    ...(section.links ?? []).map((link) => t(link.labelKey))
  ].filter(Boolean);

  return [...keys, ...localized];
}

export default function HelpPage() {
  const navigate = useNavigate();
  const { resetAll } = useHelpHints();
  const [search, setSearch] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const normalizedSearch = search.trim().toLowerCase();

  const visibleSections = useMemo(() => {
    if (!normalizedSearch) {
      return HELP_SECTIONS;
    }
    return HELP_SECTIONS.filter((section) =>
      getSectionSearchValues(section).some((value) =>
        value.toLowerCase().includes(normalizedSearch)
      )
    );
  }, [normalizedSearch]);

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "help", label: t("breadcrumb.help") }
            ]}
          />
          <h1 className="pageTitle">{t("help.title")}</h1>
        </div>
      </div>

      <Card>
        <div className="helpHeader">
          <p className="placeholderText">{t("help.description")}</p>
          <Input
            aria-label={t("help.search.ariaLabel")}
            placeholder={t("help.search.placeholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="helpIndex">
            <h2 className="sectionTitle">{t("help.index.title")}</h2>
            <div className="helpIndexLinks">
              {visibleSections.map((section) => (
                <a key={section.id} className="helpIndexLink" href={`#${section.id}`}>
                  {t(section.titleKey)}
                </a>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="helpHintsResetSection">
          <h2 className="sectionTitle">{t("help.hints.title")}</h2>
          <p className="placeholderText">{t("help.hints.description")}</p>
          <div className="helpHintsResetActions">
            <Button variant="secondary" onClick={() => setResetConfirmOpen(true)}>
              {t("help.hints.resetAll")}
            </Button>
          </div>
        </div>
      </Card>

      {visibleSections.length ? (
        visibleSections.map((section) => (
          <Card key={section.id}>
            <div className="helpSection" id={section.id}>
              <h2 className="sectionTitle">{t(section.titleKey)}</h2>
              {section.descriptionKey ? (
                <p className="placeholderText">{t(section.descriptionKey)}</p>
              ) : null}
              {section.steps?.length ? (
                <ol className="helpStepList">
                  {section.steps.map((step) => (
                    <li key={`${section.id}-${step.titleKey}`} className="helpStepItem">
                      <h3 className="helpStepTitle">{t(step.titleKey)}</h3>
                      <p className="placeholderText">{t(step.bodyKey)}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
              {section.links?.length ? (
                <div className="helpLinkRow">
                  {section.links.map((link) => (
                    <Button
                      key={`${section.id}-${link.labelKey}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(link.to)}
                    >
                      {t(link.labelKey)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </Card>
        ))
      ) : (
        <Card>
          <p className="placeholderText">{t("help.search.empty")}</p>
        </Card>
      )}

      <Modal
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        closeAriaLabel={t("common.close")}
        header={t("help.hints.resetConfirmTitle")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setResetConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                resetAll();
                setResetConfirmOpen(false);
              }}
            >
              {t("common.confirm")}
            </Button>
          </div>
        }
      >
        <p className="placeholderText">{t("help.hints.resetConfirmBody")}</p>
      </Modal>
    </div>
  );
}

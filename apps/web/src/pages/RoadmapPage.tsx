import React from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Breadcrumbs, Button, Card } from "@nemetz/ui";
import { ROADMAP_DISCLAIMER, ROADMAP_SECTIONS, type RoadmapStatus } from "../help/roadmapContent";
import { t, type I18nKey } from "../i18n";

const STATUS_CONFIG: Record<
  RoadmapStatus,
  {
    labelKey: I18nKey;
    variant: "success" | "warning" | "neutral";
  }
> = {
  available: {
    labelKey: "help.roadmap.status.available",
    variant: "success"
  },
  planned: {
    labelKey: "help.roadmap.status.planned",
    variant: "warning"
  },
  exploring: {
    labelKey: "help.roadmap.status.exploring",
    variant: "neutral"
  }
};

export default function RoadmapPage() {
  const navigate = useNavigate();

  return (
    <div className="page roadmapPage">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "help", label: t("breadcrumb.help"), onClick: () => navigate("/help") },
              { key: "roadmap", label: t("breadcrumb.roadmap") }
            ]}
          />
          <h1 className="pageTitle">{t("help.roadmap.title")}</h1>
          <p className="placeholderText roadmapLead">{t("help.roadmap.subtitle")}</p>
        </div>
        <div className="tableActions">
          <Button variant="secondary" onClick={() => navigate("/help")}>
            {t("help.roadmap.backToHelp")}
          </Button>
          <Button onClick={() => navigate("/help/quick-guide")}>{t("help.roadmap.openQuickGuide")}</Button>
        </div>
      </div>

      <Card>
        <div className="roadmapDisclaimer">
          <h2 className="sectionTitle">{t("help.roadmap.disclaimerTitle")}</h2>
          <p className="placeholderText">{ROADMAP_DISCLAIMER}</p>
        </div>
      </Card>

      <div className="roadmapSections">
        {ROADMAP_SECTIONS.map((section) => {
          const status = STATUS_CONFIG[section.status];
          return (
            <Card key={section.status}>
              <section className="roadmapSection">
                <div className="roadmapSectionHeader">
                  <div>
                    <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
                    <h2 className="sectionTitle roadmapSectionTitle">{section.title}</h2>
                    <p className="placeholderText">{section.description}</p>
                  </div>
                </div>
                <div className="roadmapItemGrid">
                  {section.items.map((item) => (
                    <article className="roadmapItem" key={`${section.status}-${item.title}`}>
                      <h3>{item.title}</h3>
                      <p className="placeholderText">{item.body}</p>
                    </article>
                  ))}
                </div>
              </section>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

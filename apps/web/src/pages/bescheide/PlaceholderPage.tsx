import React from "react";
import { Breadcrumbs, Card } from "@nemetz/ui";
import { I18nKey, t } from "../../i18n";

type PlaceholderPageProps = {
  breadcrumbKey: I18nKey;
  titleKey: I18nKey;
  placeholderKey: I18nKey;
};

export default function PlaceholderPage({
  breadcrumbKey,
  titleKey,
  placeholderKey
}: PlaceholderPageProps) {
  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "section", label: t(breadcrumbKey) }
            ]}
          />
          <h1 className="pageTitle">{t(titleKey)}</h1>
        </div>
      </div>

      <Card>
        <p className="placeholderText">{t(placeholderKey)}</p>
      </Card>
    </div>
  );
}

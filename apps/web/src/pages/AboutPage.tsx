import React, { useMemo } from "react";
import { Breadcrumbs, Card, DataTable } from "@nemetz/ui";
import { useRuntimeConfig } from "../config/runtimeConfig";
import { t } from "../i18n";
import { useNotifications } from "../state/NotificationsStore";
import { STORAGE_VERSION } from "../state/persistence";

export default function AboutPage() {
  const runtimeConfig = useRuntimeConfig();
  const { lastTickAt } = useNotifications();

  const featureRows = useMemo(
    () =>
      Object.entries(runtimeConfig.features).map(([key, enabled]) => ({
        key,
        enabled
      })),
    [runtimeConfig.features]
  );

  const featureColumns = [
    {
      key: "feature",
      header: t("about.features.name"),
      render: (row: (typeof featureRows)[number]) => row.key
    },
    {
      key: "status",
      header: t("about.features.status"),
      render: (row: (typeof featureRows)[number]) =>
        row.enabled ? t("about.status.enabled") : t("about.status.disabled")
    }
  ];

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "about", label: t("about.title") }
            ]}
          />
          <h1 className="pageTitle">{t("about.title")}</h1>
        </div>
      </div>

      <Card>
        <div className="detailGrid">
          <div>
            <div className="metaLabel">{t("about.appName")}</div>
            <div className="metaValue">{runtimeConfig.appName}</div>
          </div>
          <div>
            <div className="metaLabel">{t("about.buildLabel")}</div>
            <div className="metaValue">{runtimeConfig.buildLabel || t("common.notAvailable")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("about.storageVersion")}</div>
            <div className="metaValue">{String(STORAGE_VERSION)}</div>
          </div>
          <div>
            <div className="metaLabel">{t("about.lastTickAt")}</div>
            <div className="metaValue">{lastTickAt || t("common.notAvailable")}</div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("about.features.title")}</h2>
        <DataTable columns={featureColumns} data={featureRows} getRowKey={(row) => row.key} />
      </Card>
    </div>
  );
}

import React from "react";
import { Button, Card } from "@nemetz/ui";
import { t } from "../i18n";
import { enterSafeMode } from "../state/safeMode";
import {
  buildStorageExportPayload,
  downloadExportPayload,
  resetAllPersistedData
} from "../state/importExport/exportPayload";

type ErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Intentionally no-op: UI fallback is the primary recovery path in prototype mode.
  }

  private handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  private handleExportData = () => {
    const payload = buildStorageExportPayload();
    downloadExportPayload(payload, "nemetz-compliance-recovery");
  };

  private handleReset = () => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(t("errorBoundary.confirmReset"));
      if (!confirmed) {
        return;
      }
    }
    resetAllPersistedData();
    this.handleReload();
  };

  private handleSafeMode = () => {
    enterSafeMode();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="errorBoundaryPage">
        <Card>
          <div className="errorBoundaryContent">
            <h1 className="pageTitle">{t("errorBoundary.title")}</h1>
            <p className="placeholderText">{t("errorBoundary.description")}</p>
            <div className="errorBoundaryActions">
              <Button onClick={this.handleReload}>{t("errorBoundary.reload")}</Button>
              <Button variant="secondary" onClick={this.handleExportData}>
                {t("errorBoundary.exportData")}
              </Button>
              <Button variant="secondary" onClick={this.handleReset}>
                {t("errorBoundary.resetData")}
              </Button>
              <Button variant="ghost" onClick={this.handleSafeMode}>
                {t("errorBoundary.safeMode")}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }
}

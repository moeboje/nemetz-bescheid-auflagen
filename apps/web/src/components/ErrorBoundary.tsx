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
  exportError: string;
};

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    exportError: ""
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Intentionally no-op: the fallback UI is the recovery surface for runtime failures.
  }

  private handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  private handleExportData = async () => {
    try {
      // The boundary sits outside the local-only providers, so crash recovery falls back to
      // the last persisted browser state instead of live in-memory overrides.
      const payload = await buildStorageExportPayload();
      downloadExportPayload(payload, "nemetz-compliance-recovery");
      this.setState({ exportError: "" });
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
      this.setState({
        exportError: `${t("errorBoundary.exportFailed")}${detail}`
      });
    }
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
            {this.state.exportError ? <p className="validationText">{this.state.exportError}</p> : null}
            <div className="errorBoundaryActions">
              <Button onClick={this.handleReload}>{t("errorBoundary.reload")}</Button>
              <Button variant="secondary" onClick={() => void this.handleExportData()}>
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

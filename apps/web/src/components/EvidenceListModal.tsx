import React from "react";
import { Button, Modal } from "@nemetz/ui";
import type { DocumentOwnerType } from "../api/documents";
import { t } from "../i18n";
import type { Evidence } from "../types/evidence";
import DocumentsPanel from "./DocumentsPanel";
import EvidenceUploader from "./EvidenceUploader";

type EvidenceListModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  evidence: Evidence[];
  ownerType?: DocumentOwnerType;
  ownerId?: string;
  allowUpload?: boolean;
  allowManage?: boolean;
  onDocumentsChanged?: () => void;
};

function getOutcomeLabel(value?: "OK" | "NOK" | "FOLLOW_UP") {
  if (value === "OK") {
    return t("evidence.outcome.ok");
  }
  if (value === "NOK") {
    return t("evidence.outcome.nok");
  }
  if (value === "FOLLOW_UP") {
    return t("evidence.outcome.followUp");
  }
  return "";
}

export default function EvidenceListModal({
  open,
  onClose,
  title,
  evidence,
  ownerType,
  ownerId,
  allowUpload = false,
  allowManage = false,
  onDocumentsChanged
}: EvidenceListModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      mobileFullscreen
      header={title}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      }
    >
      {evidence.length ? (
        <div className="timeline">
          {evidence.map((item) => (
            <div key={item.id} className="timelineItem">
              <div className="metaLabel">{item.createdAt.slice(0, 16).replace("T", " ")}</div>
              <div className="metaValue">
                <div>
                  {item.createdByLabel || t("common.notAvailable")}
                  {item.outcome ? ` · ${getOutcomeLabel(item.outcome)}` : ""}
                </div>
                {item.note ? <div className="placeholderText">{item.note}</div> : null}
                {item.attachments.length ? (
                  <EvidenceUploader
                    value={item.attachments}
                    onChange={() => undefined}
                    mode="view"
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="placeholderText">{t("evidence.empty")}</p>
      )}
      {ownerType && ownerId ? (
        <div className="documentsReadOnlySection">
          <DocumentsPanel
            ownerType={ownerType}
            ownerId={ownerId}
            titleKey="documents.title"
            allowUpload={allowUpload}
            allowManage={allowManage}
            showManageActions={allowManage}
            onChanged={onDocumentsChanged}
          />
        </div>
      ) : null}
    </Modal>
  );
}

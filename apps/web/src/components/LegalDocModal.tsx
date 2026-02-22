import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import FileUploadStub, { UploadItem } from "./FileUploadStub";
import type { LegalDoc, LegalDocType } from "../data/legalDocs";

const emptyForm = {
  projectId: "",
  type: "PERMIT" as LegalDocType,
  title: "",
  shortDescription: "",
  reference: "",
  issuedAt: "",
  attachments: [] as UploadItem[],
  scopeOverrideEnabled: false,
  scopeCompanyId: "",
  scopeSiteId: "",
  scopeFacilityId: ""
};

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function createAttachment(file: File): UploadItem {
  return {
    id: `lda-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename: file.name,
    sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
    addedAt: todayStamp()
  };
}

type LegalDocModalProps = {
  open: boolean;
  onClose: () => void;
  legalDoc?: LegalDoc;
  initialProjectId?: string;
  lockProject?: boolean;
};

export default function LegalDocModal({
  open,
  onClose,
  legalDoc,
  initialProjectId,
  lockProject
}: LegalDocModalProps) {
  const { projects } = useProjects();
  const { companies, sites, facilities, getScopeLabel } = useScopes();
  const { addLegalDoc, updateLegalDoc } = useLegalDocs();
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (legalDoc) {
      setForm({
        projectId: legalDoc.projectId,
        type: legalDoc.type,
        title: legalDoc.title,
        shortDescription: legalDoc.shortDescription ?? "",
        reference: legalDoc.reference ?? "",
        issuedAt: legalDoc.issuedAt ?? "",
        attachments: legalDoc.attachments ?? [],
        scopeOverrideEnabled: Boolean(legalDoc.scopeOverride),
        scopeCompanyId: legalDoc.scopeOverride?.companyId ?? "",
        scopeSiteId: legalDoc.scopeOverride?.siteId ?? "",
        scopeFacilityId: legalDoc.scopeOverride?.facilityId ?? ""
      });
      return;
    }
    setForm({
      ...emptyForm,
      projectId: initialProjectId ?? ""
    });
  }, [initialProjectId, legalDoc, open]);

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.id, label: project.title })),
    [projects]
  );

  const activeCompanies = useMemo(
    () => companies.filter((company) => !company.isArchived),
    [companies]
  );
  const activeSites = useMemo(
    () =>
      sites.filter((site) =>
        !site.isArchived && activeCompanies.some((company) => company.id === site.companyId)
      ),
    [activeCompanies, sites]
  );
  const activeFacilities = useMemo(
    () =>
      facilities.filter((facility) =>
        !facility.isArchived &&
        activeCompanies.some((company) => company.id === facility.companyId) &&
        activeSites.some((site) => site.id === facility.siteId)
      ),
    [activeCompanies, activeSites, facilities]
  );

  const overrideCompanyOptions = useMemo(
    () => activeCompanies.map((company) => ({ value: company.id, label: company.name })),
    [activeCompanies]
  );

  const overrideSiteOptions = useMemo(
    () =>
      activeSites
        .filter((site) => site.companyId === form.scopeCompanyId)
        .map((site) => ({ value: site.id, label: site.name })),
    [activeSites, form.scopeCompanyId]
  );

  const overrideFacilityOptions = useMemo(() => {
    const base = activeFacilities.filter(
      (facility) => facility.companyId === form.scopeCompanyId
    );
    const filtered = form.scopeSiteId
      ? base.filter((facility) => facility.siteId === form.scopeSiteId)
      : base;
    return filtered.map((facility) => ({ value: facility.id, label: facility.name }));
  }, [activeFacilities, form.scopeCompanyId, form.scopeSiteId]);

  const projectScopeLabel = useMemo(() => {
    const project = projects.find((item) => item.id === form.projectId);
    if (!project) {
      return t("common.notAvailable");
    }
    return getScopeLabel(project.companyId, project.siteId, project.facilityId);
  }, [form.projectId, getScopeLabel, projects]);

  const overrideScopeLabel = useMemo(() => {
    if (!form.scopeCompanyId) {
      return "";
    }
    return getScopeLabel(form.scopeCompanyId, form.scopeSiteId, form.scopeFacilityId);
  }, [form.scopeCompanyId, form.scopeFacilityId, form.scopeSiteId, getScopeLabel]);

  const isSaveDisabled = !form.projectId || !form.title || !form.type;

  const handleSave = () => {
    const scopeOverride = form.scopeOverrideEnabled
      ? {
          companyId: form.scopeCompanyId,
          siteId: form.scopeSiteId || undefined,
          facilityId: form.scopeFacilityId || undefined
        }
      : undefined;

    if (legalDoc) {
      updateLegalDoc(legalDoc.id, {
        projectId: form.projectId,
        type: form.type,
        title: form.title,
        shortDescription: form.shortDescription,
        reference: form.reference,
        issuedAt: form.issuedAt,
        attachments: form.attachments,
        scopeOverride
      });
    } else {
      addLegalDoc({
        projectId: form.projectId,
        type: form.type,
        title: form.title,
        shortDescription: form.shortDescription,
        reference: form.reference,
        issuedAt: form.issuedAt,
        attachments: form.attachments,
        scopeOverride
      });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      header={legalDoc ? t("legalDocs.modal.editTitle") : t("legalDocs.modal.title")}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaveDisabled}>
            {t("modal.save")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        <div className="formField">
          <span className="fieldLabel">{t("legalDocs.form.project")}</span>
          <Select
            options={[{ value: "", label: t("legalDocs.form.project") }, ...projectOptions]}
            value={form.projectId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, projectId: event.target.value }))
            }
            disabled={lockProject}
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("legalDocs.form.type")}</span>
          <Select
            options={[
              { value: "PERMIT", label: t("legalDocs.types.permit") },
              { value: "DIRECTIVE", label: t("legalDocs.types.directive") },
              { value: "DECISION", label: t("legalDocs.types.decision") }
            ]}
            value={form.type}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, type: event.target.value as LegalDocType }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("legalDocs.form.title")}</span>
          <Input
            placeholder={t("legalDocs.form.title")}
            value={form.title}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, title: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("legalDocs.form.shortDescription")}</span>
          <Input
            placeholder={t("legalDocs.form.shortDescription")}
            value={form.shortDescription}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, shortDescription: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("legalDocs.form.reference")}</span>
          <Input
            placeholder={t("legalDocs.form.reference")}
            value={form.reference}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, reference: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("legalDocs.form.issuedAt")}</span>
          <Input
            type="date"
            value={form.issuedAt}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, issuedAt: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("legalDocs.form.effectiveScope")}</span>
          <div className="inlineMeta">
            {form.scopeOverrideEnabled ? overrideScopeLabel || projectScopeLabel : projectScopeLabel}
          </div>
        </div>
        <div className="formField">
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={form.scopeOverrideEnabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  scopeOverrideEnabled: event.target.checked,
                  scopeCompanyId: event.target.checked ? prev.scopeCompanyId : "",
                  scopeSiteId: event.target.checked ? prev.scopeSiteId : "",
                  scopeFacilityId: event.target.checked ? prev.scopeFacilityId : ""
                }))
              }
            />
            <span>{t("legalDocs.form.scopeOverride")}</span>
          </label>
        </div>
        {form.scopeOverrideEnabled ? (
          <div className="formSection">
            <div className="formField">
              <span className="fieldLabel">{t("legalDocs.form.scopeCompany")}</span>
              <Select
                options={[
                  { value: "", label: t("legalDocs.form.scopeCompany") },
                  ...overrideCompanyOptions
                ]}
                value={form.scopeCompanyId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    scopeCompanyId: event.target.value,
                    scopeSiteId: "",
                    scopeFacilityId: ""
                  }))
                }
              />
            </div>
            <div className="formField">
              <span className="fieldLabel">{t("legalDocs.form.scopeSite")}</span>
              <Select
                options={[
                  { value: "", label: t("legalDocs.form.scopeSite") },
                  ...overrideSiteOptions
                ]}
                value={form.scopeSiteId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    scopeSiteId: event.target.value,
                    scopeFacilityId: ""
                  }))
                }
              />
            </div>
            <div className="formField">
              <span className="fieldLabel">{t("legalDocs.form.scopeFacility")}</span>
              <Select
                options={[
                  { value: "", label: t("legalDocs.form.scopeFacility") },
                  ...overrideFacilityOptions
                ]}
                value={form.scopeFacilityId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, scopeFacilityId: event.target.value }))
                }
              />
            </div>
          </div>
        ) : null}
        <FileUploadStub
          label={t("legalDocs.form.upload")}
          selectLabel={t("common.selectFile")}
          removeLabel={t("common.remove")}
          items={form.attachments}
          onAddFiles={(files) =>
            setForm((prev) => ({
              ...prev,
              attachments: [...prev.attachments, ...files.map(createAttachment)]
            }))
          }
          onRemove={(id) =>
            setForm((prev) => ({
              ...prev,
              attachments: prev.attachments.filter((item) => item.id !== id)
            }))
          }
        />
      </div>
    </Modal>
  );
}

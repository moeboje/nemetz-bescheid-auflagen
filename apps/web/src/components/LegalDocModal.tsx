import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useObligations } from "../state/ObligationsStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useAuditLog } from "../state/AuditLogStore";
import { useAuthorities } from "../state/AuthoritiesStore";
import { cloneDefaultObligationEvidenceRequirements } from "../data/obligations";
import FileUploadStub, { UploadItem } from "./FileUploadStub";
import type { LegalDoc, LegalDocType } from "../data/legalDocs";
import type {
  AiAnalysisResult,
  AiDeadlineSuggestion,
  AiDocType,
  AiObligationSuggestion
} from "../types/aiAnalysis";
import { analyzeDocument, AiAnalyzeError } from "../api/ai";
import AiAnalysisReviewModal, { type AiReviewAcceptedPayload } from "./AiAnalysisReviewModal";
import { useRuntimeConfig } from "../config/runtimeConfig";

const emptyForm = {
  projectId: "",
  type: "PERMIT" as LegalDocType,
  title: "",
  shortDescription: "",
  reference: "",
  issuedAt: "",
  authorityId: "",
  authorityContactId: "",
  attachments: [] as UploadItem[],
  scopeOverrideEnabled: false,
  scopeCompanyId: "",
  scopeSiteId: "",
  scopeFacilityId: ""
};

type LegalDocModalProps = {
  open: boolean;
  onClose: () => void;
  legalDoc?: LegalDoc;
  initialProjectId?: string;
  lockProject?: boolean;
};

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function createAttachment(file: File): UploadItem {
  return {
    id: `lda-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename: file.name,
    sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
    addedAt: new Date().toISOString().slice(0, 10)
  };
}

function mapAiDocTypeToLegalDocType(docType?: AiDocType): LegalDocType | undefined {
  if (docType === "BESCHEID") {
    return "DECISION";
  }
  if (docType === "GEWERBE") {
    return "PERMIT";
  }
  if (docType === "SAMMELGENEHMIGUNG") {
    return "DIRECTIVE";
  }
  if (docType === "SONSTIGES") {
    return "OTHER";
  }
  return undefined;
}

function getObligationInterval(interval: AiObligationSuggestion["interval"]) {
  if (interval === "MONTHLY") {
    return { intervalUnit: "MONTH" as const, intervalValue: 1 };
  }
  if (interval === "QUARTERLY") {
    return { intervalUnit: "MONTH" as const, intervalValue: 3 };
  }
  if (interval === "SEMIANNUAL") {
    return { intervalUnit: "MONTH" as const, intervalValue: 6 };
  }
  if (interval === "ANNUAL") {
    return { intervalUnit: "YEAR" as const, intervalValue: 1 };
  }
  if (interval === "CUSTOM") {
    return { intervalUnit: "MONTH" as const, intervalValue: 1 };
  }
  return { intervalUnit: undefined, intervalValue: undefined };
}

function defaultReminderDays(obligation: AiObligationSuggestion) {
  if (typeof obligation.reminder?.daysBefore === "number") {
    return Math.max(0, Math.min(365, Math.round(obligation.reminder.daysBefore)));
  }
  if (obligation.scheduling === "RECURRING") {
    if (obligation.interval === "ANNUAL") {
      return 30;
    }
    if (obligation.interval === "SEMIANNUAL" || obligation.interval === "QUARTERLY") {
      return 14;
    }
    if (obligation.interval === "MONTHLY") {
      return 7;
    }
  }
  return 7;
}

function defaultDeadlineReminderDays(deadline: AiDeadlineSuggestion) {
  return deadline.relatedTo === "PROJECT" ? 14 : 7;
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }
  return `${size} B`;
}

function getAnalyzeErrorText(error: unknown) {
  if (error instanceof AiAnalyzeError) {
    if (error.code === "FILE_TOO_LARGE") {
      return t("ai.errors.fileTooLarge");
    }
    if (error.code === "NO_PROVIDER") {
      return t("ai.errors.noProvider");
    }
    return t("ai.errors.server");
  }
  return t("ai.errors.server");
}

export default function LegalDocModal({
  open,
  onClose,
  legalDoc,
  initialProjectId,
  lockProject
}: LegalDocModalProps) {
  const runtimeConfig = useRuntimeConfig();
  const { projects } = useProjects();
  const { companies, sites, facilities, getScopeLabel } = useScopes();
  const { addLegalDoc, updateLegalDoc } = useLegalDocs();
  const { addObligation } = useObligations();
  const { addDeadline } = useDeadlines();
  const { addAuthority, addContact } = useAuthorities();
  const { logEvent } = useAuditLog();

  const [form, setForm] = useState(emptyForm);
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string>("");
  const [analysisResult, setAnalysisResult] = useState<AiAnalysisResult | undefined>(undefined);
  const [reviewOpen, setReviewOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);

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
        authorityId: legalDoc.authorityId ?? "",
        authorityContactId: legalDoc.authorityContactId ?? "",
        attachments: legalDoc.attachments ?? [],
        scopeOverrideEnabled: Boolean(legalDoc.scopeOverride),
        scopeCompanyId: legalDoc.scopeOverride?.companyId ?? "",
        scopeSiteId: legalDoc.scopeOverride?.siteId ?? "",
        scopeFacilityId: legalDoc.scopeOverride?.facilityId ?? ""
      });
      setAnalysisResult(legalDoc.aiExtraction);
    } else {
      setForm({
        ...emptyForm,
        projectId: initialProjectId ?? ""
      });
      setAnalysisResult(undefined);
    }

    setAnalysisFile(null);
    setAnalysisError("");
    setAnalysisLoading(false);
    setReviewOpen(false);
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
    const base = activeFacilities.filter((facility) => facility.companyId === form.scopeCompanyId);
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

  const scopeOverrideError =
    form.scopeOverrideEnabled && !form.scopeCompanyId ? t("legalDocs.validation.scopeCompany") : "";
  const isSaveDisabled = !form.projectId || !form.title || !form.type || Boolean(scopeOverrideError);

  const runAiAnalysis = async () => {
    if (!analysisFile) {
      return;
    }

    if (analysisFile.size > MAX_FILE_BYTES) {
      setAnalysisError(t("ai.errors.fileTooLarge"));
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError("");

    const actorEntityId = legalDoc?.id ?? `draft-${Date.now()}`;

    logEvent({
      actorLabel: "Demo User",
      entityType: "LEGAL_DOC",
      entityId: actorEntityId,
      action: "AI_RUN_STARTED",
      summary: analysisFile.name
    });

    try {
      const result = await analyzeDocument(analysisFile, {
        mode: runtimeConfig.ai?.provider === "azure" ? "azure" : "mock",
        preferredLanguage: navigator.language.toLowerCase().startsWith("en") ? "en" : "de",
        baseUrl: runtimeConfig.ai?.proxyBaseUrl || ""
      });

      setAnalysisResult(result);
      setReviewOpen(true);

      if (legalDoc) {
        updateLegalDoc(legalDoc.id, { aiExtraction: result });
      }

      logEvent({
        actorLabel: "Demo User",
        entityType: "LEGAL_DOC",
        entityId: actorEntityId,
        action: "AI_RUN_COMPLETED",
        summary: result.id
      });
    } catch (error) {
      setAnalysisError(getAnalyzeErrorText(error));
      logEvent({
        actorLabel: "Demo User",
        entityType: "LEGAL_DOC",
        entityId: actorEntityId,
        action: "AI_RUN_COMPLETED",
        summary: "AI error"
      });
    } finally {
      setAnalysisLoading(false);
    }
  };

  const persistLegalDoc = (
    payload: AiReviewAcceptedPayload,
    result: AiAnalysisResult
  ) => {
    const resolvedProjectId = payload.meta.projectId || form.projectId;
    const resolvedType = mapAiDocTypeToLegalDocType(payload.meta.docType) || form.type;

    if (!resolvedProjectId) {
      setAnalysisError(t("ai.errors.missingProject"));
      return;
    }

    const scopeOverride = payload.meta.scopeCompanyId
      ? {
          companyId: payload.meta.scopeCompanyId,
          siteId: payload.meta.scopeSiteId || undefined,
          facilityId: payload.meta.scopeFacilityId || undefined
        }
      : form.scopeOverrideEnabled
      ? {
          companyId: form.scopeCompanyId,
          siteId: form.scopeSiteId || undefined,
          facilityId: form.scopeFacilityId || undefined
        }
      : undefined;

    let authorityId = payload.meta.authorityId || form.authorityId || undefined;
    if (!authorityId && payload.meta.createAuthority && payload.meta.authorityName) {
      const createdAuthority = addAuthority({
        name: payload.meta.authorityName,
        shortName: ""
      });
      authorityId = createdAuthority.id;
    }

    let authorityContactId = payload.meta.authorityContactId || form.authorityContactId || undefined;
    if (
      !authorityContactId &&
      payload.meta.createContact &&
      authorityId &&
      payload.meta.authorityContactName
    ) {
      const createdContact = addContact({
        authorityId,
        name: payload.meta.authorityContactName,
        email: payload.meta.authorityContactEmail,
        phone: "",
        roleTitle: ""
      });
      authorityContactId = createdContact.id;
    }

    const legalDocPayload = {
      projectId: resolvedProjectId,
      type: resolvedType,
      title: payload.meta.title || form.title || t("legalDocs.modal.title"),
      shortDescription: payload.meta.shortDescription ?? form.shortDescription,
      reference: payload.meta.referenceNumber ?? form.reference,
      issuedAt: payload.meta.issueDate ?? form.issuedAt,
      authorityId,
      authorityContactId,
      attachments: form.attachments,
      aiExtraction: result,
      scopeOverride
    };

    const savedDocId = legalDoc?.id ?? addLegalDoc(legalDocPayload).id;

    if (legalDoc) {
      updateLegalDoc(legalDoc.id, legalDocPayload);
    }

    const acceptedObligationIds = new Set(payload.obligations.map((obligation) => obligation.id));

    payload.obligations.forEach((obligation) => {
      const interval = getObligationInterval(obligation.interval);
      addObligation({
        legalDocId: savedDocId,
        title: obligation.title,
        infoTextLong: obligation.longDescription ?? "",
        level: obligation.dutyLevel === "RECOMMENDED" ? "RECOMMENDED" : "MANDATORY",
        scheduleType: obligation.scheduling === "RECURRING" ? "RECURRING" : "ONCE",
        firstDueDate: obligation.firstDueDate || undefined,
        intervalUnit: obligation.scheduling === "RECURRING" ? interval.intervalUnit : undefined,
        intervalValue: obligation.scheduling === "RECURRING" ? interval.intervalValue : undefined,
        ownerUserId: undefined,
        deputyUserId: undefined,
        origin: "AI_ACCEPTED",
        sourceSuggestionId: obligation.id,
        sourceRunId: result.id,
        criticality: undefined,
        emailReminderEnabled: Boolean(obligation.reminder?.emailEnabled),
        emailReminderDaysBefore: obligation.reminder?.emailEnabled
          ? defaultReminderDays(obligation)
          : undefined,
        evidenceRequirements: {
          ...cloneDefaultObligationEvidenceRequirements(),
          requirePhoto: Boolean(obligation.evidenceRequirements?.requirePhoto),
          requireDocument: Boolean(obligation.evidenceRequirements?.requireDocument),
          requireReport: Boolean(obligation.evidenceRequirements?.requireReport)
        }
      });
      logEvent({
        actorLabel: "Demo User",
        entityType: "OBLIGATION",
        entityId: obligation.id,
        action: "AI_SUGGESTION_ACCEPTED",
        summary: obligation.title
      });
    });

    result.obligations.forEach((obligation) => {
      if (!acceptedObligationIds.has(obligation.id)) {
        logEvent({
          actorLabel: "Demo User",
          entityType: "LEGAL_DOC",
          entityId: savedDocId,
          action: "AI_SUGGESTION_REJECTED",
          summary: obligation.title
        });
      }
    });

    payload.deadlines.forEach((deadline) => {
      addDeadline({
        title: deadline.title,
        description: deadline.context ?? "",
        dueDate: deadline.dueDate,
        projectId: deadline.relatedTo === "PROJECT" ? resolvedProjectId : undefined,
        legalDocId: deadline.relatedTo === "LEGAL_DOC" ? savedDocId : undefined,
        authorityId,
        ownerUserId: undefined,
        deputyUserId: undefined,
        emailReminderEnabled: true,
        emailReminderDaysBefore: defaultDeadlineReminderDays(deadline)
      });
    });

    logEvent({
      actorLabel: "Demo User",
      entityType: "LEGAL_DOC",
      entityId: savedDocId,
      action: "AI_FIELDS_APPLIED",
      summary: `${payload.obligations.length} obligations, ${payload.deadlines.length} deadlines`
    });

    onClose();
  };

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
        authorityId: form.authorityId || undefined,
        authorityContactId: form.authorityContactId || undefined,
        attachments: form.attachments,
        aiExtraction: analysisResult,
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
        authorityId: form.authorityId || undefined,
        authorityContactId: form.authorityContactId || undefined,
        attachments: form.attachments,
        aiExtraction: analysisResult,
        scopeOverride
      });
    }
    onClose();
  };

  return (
    <>
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
                { value: "OTHER", label: t("legalDocs.types.other") },
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
                {scopeOverrideError ? <span className="validationText">{scopeOverrideError}</span> : null}
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

          <div className="formSection">
            <div className="sectionHeader">
              <h3 className="sectionTitle">{t("ai.title")}</h3>
              <Button
                variant="secondary"
                disabled={!analysisResult}
                onClick={() => setReviewOpen(true)}
              >
                {t("ai.review.title")}
              </Button>
            </div>

            <div className="uploadRow uploadRowWrap">
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={analysisLoading}
              >
                {t("legalDocs.form.selectFile")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*,.doc,.docx"
                className="fileInputHidden"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setAnalysisFile(nextFile);
                  setAnalysisError("");
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />

              <Button
                variant="secondary"
                onClick={() => captureInputRef.current?.click()}
                disabled={analysisLoading}
              >
                {t("evidence.upload.photoCapture")}
              </Button>
              <input
                ref={captureInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="fileInputHidden"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setAnalysisFile(nextFile);
                  setAnalysisError("");
                  if (captureInputRef.current) {
                    captureInputRef.current.value = "";
                  }
                }}
              />

              <Button onClick={() => void runAiAnalysis()} disabled={!analysisFile || analysisLoading}>
                {analysisLoading ? t("ai.loading") : t("ai.start")}
              </Button>
            </div>

            {analysisFile ? (
              <div className="inlineMeta">
                <span>{analysisFile.name}</span>
                <span>{formatFileSize(analysisFile.size)}</span>
              </div>
            ) : (
              <p className="placeholderText">{t("ai.file.none")}</p>
            )}

            {analysisError ? <span className="validationText">{analysisError}</span> : null}

            {analysisResult ? (
              <div className="inlineMeta">
                <span>{t("ai.review.language")}: {analysisResult.language ?? t("common.notAvailable")}</span>
                <span>{t("ai.obligations.title")}: {analysisResult.obligations.length}</span>
                <span>{t("ai.deadlines.title")}: {analysisResult.deadlines.length}</span>
              </div>
            ) : null}
          </div>

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

      {analysisResult ? (
        <AiAnalysisReviewModal
          open={reviewOpen}
          result={analysisResult}
          onCancel={() => setReviewOpen(false)}
          onApply={(accepted) => {
            setReviewOpen(false);
            persistLegalDoc(accepted, analysisResult);
          }}
        />
      ) : null}
    </>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import type {
  AiAnalysisResult,
  AiDeadlineSuggestion,
  AiDocType,
  AiLanguage,
  AiObligationSuggestion
} from "../types/aiAnalysis";
import ConfidenceBadge from "./ConfidenceBadge";
import { useAuthorities } from "../state/AuthoritiesStore";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { bestMatchByName, matchAuthority, matchContact, matchScope } from "../services/smartMatch";

type EditableObligation = AiObligationSuggestion & {
  accepted: boolean;
};

type EditableDeadline = AiDeadlineSuggestion & {
  accepted: boolean;
};

export type AiReviewAcceptedPayload = {
  language?: AiLanguage;
  meta: {
    title?: string;
    shortDescription?: string;
    referenceNumber?: string;
    issueDate?: string;
    docType?: AiDocType;
    authorityId?: string;
    authorityName?: string;
    createAuthority?: boolean;
    authorityContactId?: string;
    authorityContactName?: string;
    authorityContactEmail?: string;
    createContact?: boolean;
    scopeCompanyId?: string;
    scopeSiteId?: string;
    scopeFacilityId?: string;
    projectId?: string;
    projectTitleSuggestion?: string;
    createProject?: boolean;
  };
  obligations: AiObligationSuggestion[];
  deadlines: AiDeadlineSuggestion[];
};

type MetaFormState = {
  title: string;
  shortDescription: string;
  referenceNumber: string;
  issueDate: string;
  docType: AiDocType;
  authorityId: string;
  authorityName: string;
  createAuthority: boolean;
  authorityContactId: string;
  authorityContactName: string;
  authorityContactEmail: string;
  createContact: boolean;
  scopeCompanyId: string;
  scopeSiteId: string;
  scopeFacilityId: string;
  projectId: string;
  projectTitleSuggestion: string;
  createProject: boolean;
};

type AiAnalysisReviewModalProps = {
  open: boolean;
  result: AiAnalysisResult;
  onCancel: () => void;
  onApply: (accepted: AiReviewAcceptedPayload) => void;
  projectOptions?: Array<{ value: string; label: string }>;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function clampReminderDays(value: unknown, fallback = 7) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(value), 0), 365);
}

function normalizeObligation(item: AiObligationSuggestion): EditableObligation {
  return {
    ...item,
    accepted: true,
    title: item.title?.trim() || t("ai.obligations.defaultTitle"),
    longDescription: item.longDescription ?? "",
    dutyLevel: item.dutyLevel ?? "MANDATORY",
    scheduling: item.scheduling ?? "ONE_TIME",
    interval: item.interval ?? "ANNUAL",
    firstDueDate: item.firstDueDate ?? "",
    evidenceRequirements: {
      requirePhoto: Boolean(item.evidenceRequirements?.requirePhoto),
      requireDocument: Boolean(item.evidenceRequirements?.requireDocument),
      requireReport: Boolean(item.evidenceRequirements?.requireReport)
    },
    reminder: {
      emailEnabled: Boolean(item.reminder?.emailEnabled),
      daysBefore: clampReminderDays(item.reminder?.daysBefore, 7)
    }
  };
}

function normalizeDeadline(item: AiDeadlineSuggestion): EditableDeadline {
  return {
    ...item,
    accepted: true,
    title: item.title?.trim() || t("ai.deadlines.defaultTitle"),
    dueDate: item.dueDate ?? "",
    context: item.context ?? "",
    relatedTo: item.relatedTo ?? "LEGAL_DOC"
  };
}

function createInitialMeta(
  result: AiAnalysisResult,
  authorityId: string,
  contactId: string,
  scopeMatch: { companyId?: string; siteId?: string; facilityId?: string },
  projectId: string
): MetaFormState {
  return {
    title: result.meta.title ?? "",
    shortDescription: result.meta.shortDescription ?? "",
    referenceNumber: result.meta.referenceNumber ?? "",
    issueDate: result.meta.issueDate ?? "",
    docType: result.meta.docType ?? "SONSTIGES",
    authorityId,
    authorityName: result.meta.authorityName ?? "",
    createAuthority: false,
    authorityContactId: contactId,
    authorityContactName: result.meta.authorityContactName ?? "",
    authorityContactEmail: result.meta.authorityContactEmail ?? "",
    createContact: false,
    scopeCompanyId: scopeMatch.companyId ?? "",
    scopeSiteId: scopeMatch.siteId ?? "",
    scopeFacilityId: scopeMatch.facilityId ?? "",
    projectId,
    projectTitleSuggestion: result.meta.projectTitleSuggestion ?? "",
    createProject: false
  };
}

function filterTruthy<T>(value: Array<T | null | undefined>): T[] {
  return value.filter((entry): entry is T => Boolean(entry));
}

export default function AiAnalysisReviewModal({
  open,
  result,
  onCancel,
  onApply,
  projectOptions: providedProjectOptions
}: AiAnalysisReviewModalProps) {
  const { authorities, contacts, getContacts } = useAuthorities();
  const { projects } = useProjects();
  const { companies, sites, facilities } = useScopes();

  const authorityMatch = useMemo(
    () => matchAuthority(authorities, result.meta.authorityName),
    [authorities, result.meta.authorityName]
  );

  const preselectedAuthorityId = authorityMatch.score >= 0.35 ? authorityMatch.id ?? "" : "";

  const contactMatch = useMemo(
    () =>
      matchContact(
        contacts,
        preselectedAuthorityId,
        result.meta.authorityContactName,
        result.meta.authorityContactEmail
      ),
    [contacts, preselectedAuthorityId, result.meta.authorityContactEmail, result.meta.authorityContactName]
  );

  const preselectedContactId = contactMatch.score >= 0.35 ? contactMatch.id ?? "" : "";

  const scopeMatch = useMemo(
    () =>
      matchScope({
        companies,
        sites,
        facilities,
        company: result.meta.scopeCompany,
        site: result.meta.scopeSite,
        facility: result.meta.scopeFacility
      }),
    [companies, facilities, result.meta.scopeCompany, result.meta.scopeFacility, result.meta.scopeSite, sites]
  );

  const projectMatch = useMemo(
    () => bestMatchByName(projects, result.meta.projectTitleSuggestion, (project) => project.title),
    [projects, result.meta.projectTitleSuggestion]
  );

  const preselectedProjectId = projectMatch.score >= 0.35 ? projectMatch.id ?? "" : "";

  const [meta, setMeta] = useState<MetaFormState>(
    createInitialMeta(result, preselectedAuthorityId, preselectedContactId, scopeMatch, preselectedProjectId)
  );
  const [obligations, setObligations] = useState<EditableObligation[]>(
    result.obligations.map((item) => normalizeObligation(item))
  );
  const [deadlines, setDeadlines] = useState<EditableDeadline[]>(
    result.deadlines.map((item) => normalizeDeadline(item))
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setMeta(
      createInitialMeta(result, preselectedAuthorityId, preselectedContactId, scopeMatch, preselectedProjectId)
    );
    setObligations(result.obligations.map((item) => normalizeObligation(item)));
    setDeadlines(result.deadlines.map((item) => normalizeDeadline(item)));
  }, [
    open,
    preselectedAuthorityId,
    preselectedContactId,
    preselectedProjectId,
    result,
    scopeMatch
  ]);

  const activeAuthorities = useMemo(
    () => authorities.filter((authority) => !authority.isArchived),
    [authorities]
  );
  const authorityOptions = useMemo(
    () => activeAuthorities.map((authority) => ({ value: authority.id, label: authority.name })),
    [activeAuthorities]
  );

  const contactOptions = useMemo(() => {
    if (!meta.authorityId) {
      return [];
    }
    return getContacts(meta.authorityId)
      .filter((contact) => !contact.isArchived)
      .map((contact) => ({ value: contact.id, label: contact.name }));
  }, [getContacts, meta.authorityId]);

  const activeCompanies = useMemo(() => companies.filter((company) => !company.isArchived), [companies]);
  const companyOptions = useMemo(
    () => activeCompanies.map((company) => ({ value: company.id, label: company.name })),
    [activeCompanies]
  );

  const activeSites = useMemo(
    () =>
      sites.filter(
        (site) =>
          !site.isArchived &&
          activeCompanies.some((company) => company.id === site.companyId)
      ),
    [activeCompanies, sites]
  );

  const siteOptions = useMemo(
    () =>
      activeSites
        .filter((site) => (meta.scopeCompanyId ? site.companyId === meta.scopeCompanyId : true))
        .map((site) => ({ value: site.id, label: site.name })),
    [activeSites, meta.scopeCompanyId]
  );

  const activeFacilities = useMemo(
    () =>
      facilities.filter(
        (facility) =>
          !facility.isArchived &&
          activeCompanies.some((company) => company.id === facility.companyId) &&
          activeSites.some((site) => site.id === facility.siteId)
      ),
    [activeCompanies, activeSites, facilities]
  );

  const facilityOptions = useMemo(
    () =>
      activeFacilities
        .filter((facility) => (meta.scopeCompanyId ? facility.companyId === meta.scopeCompanyId : true))
        .filter((facility) => (meta.scopeSiteId ? facility.siteId === meta.scopeSiteId : true))
        .map((facility) => ({ value: facility.id, label: facility.name })),
    [activeFacilities, meta.scopeCompanyId, meta.scopeSiteId]
  );

  const fallbackProjectOptions = useMemo(
    () =>
      projects
        .filter((project) => !project.isArchived && !project.archivedAt)
        .map((project) => ({ value: project.id, label: project.title })),
    [projects]
  );
  const projectOptions = providedProjectOptions ?? fallbackProjectOptions;

  const invalidObligationIds = useMemo(() => {
    return new Set(
      obligations
        .filter((obligation) => {
          if (!obligation.accepted) {
            return false;
          }
          if (!obligation.title.trim()) {
            return true;
          }
          if (obligation.scheduling === "RECURRING") {
            return !obligation.firstDueDate || !isValidIsoDate(obligation.firstDueDate);
          }
          if (obligation.firstDueDate && !isValidIsoDate(obligation.firstDueDate)) {
            return true;
          }
          return false;
        })
        .map((obligation) => obligation.id)
    );
  }, [obligations]);

  const invalidDeadlineIds = useMemo(() => {
    return new Set(
      deadlines
        .filter(
          (deadline) =>
            deadline.accepted &&
            (!deadline.title.trim() || !deadline.dueDate || !isValidIsoDate(deadline.dueDate))
        )
        .map((deadline) => deadline.id)
    );
  }, [deadlines]);

  const pastDeadlineIds = useMemo(() => {
    const today = todayIso();
    return new Set(
      deadlines
        .filter((deadline) => deadline.accepted && isValidIsoDate(deadline.dueDate) && deadline.dueDate < today)
        .map((deadline) => deadline.id)
    );
  }, [deadlines]);

  const canApply = invalidObligationIds.size === 0 && invalidDeadlineIds.size === 0;

  const updateObligation = (
    obligationId: string,
    patch: Partial<EditableObligation>
  ) => {
    setObligations((prev) =>
      prev.map((item) => (item.id === obligationId ? { ...item, ...patch } : item))
    );
  };

  const updateDeadline = (deadlineId: string, patch: Partial<EditableDeadline>) => {
    setDeadlines((prev) =>
      prev.map((item) => (item.id === deadlineId ? { ...item, ...patch } : item))
    );
  };

  const handleApply = () => {
    if (!canApply) {
      return;
    }

    const acceptedObligations = filterTruthy(
      obligations
        .filter((item) => item.accepted)
        .map((item) => {
          const cleaned: AiObligationSuggestion = {
            ...item,
            title: item.title.trim(),
            longDescription: item.longDescription?.trim() || undefined,
            firstDueDate: item.firstDueDate || undefined,
            responsibleRoleHint: item.responsibleRoleHint?.trim() || undefined,
            evidenceRequirements: {
              requirePhoto: Boolean(item.evidenceRequirements?.requirePhoto),
              requireDocument: Boolean(item.evidenceRequirements?.requireDocument),
              requireReport: Boolean(item.evidenceRequirements?.requireReport)
            },
            reminder: {
              emailEnabled: Boolean(item.reminder?.emailEnabled),
              daysBefore: item.reminder?.emailEnabled
                ? clampReminderDays(item.reminder?.daysBefore, 7)
                : undefined
            }
          };

          if (cleaned.scheduling === "RECURRING" && !cleaned.firstDueDate) {
            return null;
          }
          return cleaned;
        })
    );

    const acceptedDeadlines = filterTruthy(
      deadlines
        .filter((item) => item.accepted)
        .map((item) => {
          if (!item.dueDate || !isValidIsoDate(item.dueDate)) {
            return null;
          }
          return {
            ...item,
            title: item.title.trim(),
            dueDate: item.dueDate,
            context: item.context?.trim() || undefined
          } as AiDeadlineSuggestion;
        })
    );

    onApply({
      language: result.language,
      meta: {
        title: meta.title.trim() || undefined,
        shortDescription: meta.shortDescription.trim() || undefined,
        referenceNumber: meta.referenceNumber.trim() || undefined,
        issueDate: meta.issueDate || undefined,
        docType: meta.docType,
        authorityId: meta.authorityId || undefined,
        authorityName: meta.authorityName.trim() || undefined,
        createAuthority: meta.createAuthority,
        authorityContactId: meta.authorityContactId || undefined,
        authorityContactName: meta.authorityContactName.trim() || undefined,
        authorityContactEmail: meta.authorityContactEmail.trim() || undefined,
        createContact: meta.createContact,
        scopeCompanyId: meta.scopeCompanyId || undefined,
        scopeSiteId: meta.scopeSiteId || undefined,
        scopeFacilityId: meta.scopeFacilityId || undefined,
        projectId: meta.projectId || undefined,
        projectTitleSuggestion: meta.projectTitleSuggestion.trim() || undefined,
        createProject: meta.createProject
      },
      obligations: acceptedObligations,
      deadlines: acceptedDeadlines
    });
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeAriaLabel={t("modal.close")}
      mobileFullscreen
      header={t("ai.review.title")}
      footer={
        <div className="modalFooter">
          <div className="modalFooterHint">{t("ai.hint.review")}</div>
          <Button variant="secondary" onClick={onCancel}>
            {t("ai.cancel")}
          </Button>
          <Button onClick={handleApply} disabled={!canApply}>
            {t("ai.apply")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        <div className="formSection">
          <div className="sectionHeader">
            <h3 className="sectionTitle">{t("ai.review.summary")}</h3>
            <div className="inlineMeta">
              <span>{t("ai.review.language")}: {result.language ?? t("common.notAvailable")}</span>
              <span>{t("ai.review.createdAt")}: {result.createdAt}</span>
            </div>
          </div>
          <div className="inlineMeta">
            <span>{t("ai.review.confidenceLegend")}</span>
            <Badge variant="success">{t("ai.confidence.high")}</Badge>
            <Badge variant="warning">{t("ai.confidence.medium")}</Badge>
            <Badge variant="danger">{t("ai.confidence.low")}</Badge>
            <Badge variant="neutral">{t("ai.confidence.unknown")}</Badge>
          </div>
          {result.warnings?.length ? (
            <div className="timeline">
              {result.warnings.map((warning) => (
                <div key={warning} className="placeholderText">
                  {warning}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="formSection">
          <h3 className="sectionTitle">{t("ai.meta.title")}</h3>
          <div className="aiFieldGrid">
            <div className="formField">
              <div className="aiFieldLabelRow">
                <span className="fieldLabel">{t("ai.meta.title")}</span>
                <ConfidenceBadge confidence={result.meta.confidence?.title} />
              </div>
              <Input
                value={meta.title}
                onChange={(event) => setMeta((prev) => ({ ...prev, title: event.target.value }))}
              />
            </div>
            <div className="formField">
              <div className="aiFieldLabelRow">
                <span className="fieldLabel">{t("ai.meta.shortDescription")}</span>
                <ConfidenceBadge confidence={result.meta.confidence?.shortDescription} />
              </div>
              <Input
                value={meta.shortDescription}
                onChange={(event) =>
                  setMeta((prev) => ({ ...prev, shortDescription: event.target.value }))
                }
              />
            </div>
            <div className="formField">
              <div className="aiFieldLabelRow">
                <span className="fieldLabel">{t("ai.meta.referenceNumber")}</span>
                <ConfidenceBadge confidence={result.meta.confidence?.referenceNumber} />
              </div>
              <Input
                value={meta.referenceNumber}
                onChange={(event) =>
                  setMeta((prev) => ({ ...prev, referenceNumber: event.target.value }))
                }
              />
            </div>
            <div className="formField">
              <div className="aiFieldLabelRow">
                <span className="fieldLabel">{t("ai.meta.issueDate")}</span>
                <ConfidenceBadge confidence={result.meta.confidence?.issueDate} />
              </div>
              <Input
                type="date"
                value={meta.issueDate}
                onChange={(event) => setMeta((prev) => ({ ...prev, issueDate: event.target.value }))}
              />
            </div>
            <div className="formField">
              <div className="aiFieldLabelRow">
                <span className="fieldLabel">{t("ai.meta.docType")}</span>
                <ConfidenceBadge confidence={result.meta.confidence?.docType} />
              </div>
              <Select
                options={[
                  { value: "BESCHEID", label: t("ai.docType.bescheid") },
                  { value: "GEWERBE", label: t("ai.docType.gewerbe") },
                  { value: "SAMMELGENEHMIGUNG", label: t("ai.docType.sammelgenehmigung") },
                  { value: "SONSTIGES", label: t("ai.docType.sonstiges") }
                ]}
                value={meta.docType}
                onChange={(event) =>
                  setMeta((prev) => ({ ...prev, docType: event.target.value as AiDocType }))
                }
              />
            </div>
            <div className="formField">
              <div className="aiFieldLabelRow">
                <span className="fieldLabel">{t("ai.meta.project")}</span>
                <ConfidenceBadge confidence={result.meta.confidence?.projectTitleSuggestion} />
              </div>
              <Select
                options={[{ value: "", label: t("ai.meta.project") }, ...projectOptions]}
                value={meta.projectId}
                onChange={(event) => setMeta((prev) => ({ ...prev, projectId: event.target.value }))}
              />
              <Input
                placeholder={t("ai.meta.projectSuggestion")}
                value={meta.projectTitleSuggestion}
                onChange={(event) =>
                  setMeta((prev) => ({ ...prev, projectTitleSuggestion: event.target.value }))
                }
              />
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={meta.createProject}
                  onChange={(event) =>
                    setMeta((prev) => ({ ...prev, createProject: event.target.checked }))
                  }
                />
                <span>{t("ai.meta.projectCreate")}</span>
              </label>
            </div>
          </div>

          <div className="aiSplitGrid">
            <div className="formSection">
              <div className="aiFieldLabelRow">
                <span className="fieldLabel">{t("ai.meta.authority")}</span>
                <ConfidenceBadge confidence={result.meta.confidence?.authorityName} />
              </div>
              <Select
                options={[{ value: "", label: t("ai.meta.authority") }, ...authorityOptions]}
                value={meta.authorityId}
                onChange={(event) =>
                  setMeta((prev) => ({
                    ...prev,
                    authorityId: event.target.value,
                    authorityContactId: "",
                    createAuthority: false
                  }))
                }
              />
              <Input
                placeholder={t("ai.meta.authorityName")}
                value={meta.authorityName}
                onChange={(event) =>
                  setMeta((prev) => ({ ...prev, authorityName: event.target.value }))
                }
              />
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={meta.createAuthority}
                  onChange={(event) =>
                    setMeta((prev) => ({
                      ...prev,
                      createAuthority: event.target.checked,
                      authorityId: event.target.checked ? "" : prev.authorityId
                    }))
                  }
                />
                <span>{t("ai.meta.authorityCreate")}</span>
              </label>
            </div>

            <div className="formSection">
              <div className="aiFieldLabelRow">
                <span className="fieldLabel">{t("ai.meta.contact")}</span>
                <ConfidenceBadge confidence={result.meta.confidence?.authorityContact} />
              </div>
              <Select
                options={[{ value: "", label: t("ai.meta.contact") }, ...contactOptions]}
                value={meta.authorityContactId}
                onChange={(event) =>
                  setMeta((prev) => ({
                    ...prev,
                    authorityContactId: event.target.value,
                    createContact: false
                  }))
                }
                disabled={!meta.authorityId}
              />
              <Input
                placeholder={t("ai.meta.contactName")}
                value={meta.authorityContactName}
                onChange={(event) =>
                  setMeta((prev) => ({ ...prev, authorityContactName: event.target.value }))
                }
              />
              <Input
                placeholder={t("ai.meta.contactEmail")}
                value={meta.authorityContactEmail}
                onChange={(event) =>
                  setMeta((prev) => ({ ...prev, authorityContactEmail: event.target.value }))
                }
              />
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={meta.createContact}
                  onChange={(event) =>
                    setMeta((prev) => ({
                      ...prev,
                      createContact: event.target.checked,
                      authorityContactId: event.target.checked ? "" : prev.authorityContactId
                    }))
                  }
                />
                <span>{t("ai.meta.contactCreate")}</span>
              </label>
            </div>
          </div>

          <div className="formSection">
            <div className="aiFieldLabelRow">
              <span className="fieldLabel">{t("ai.meta.scope")}</span>
              <ConfidenceBadge confidence={result.meta.confidence?.scope} />
            </div>
            <div className="inlineFieldRow">
              <Select
                options={[{ value: "", label: t("ai.meta.scopeCompany") }, ...companyOptions]}
                value={meta.scopeCompanyId}
                onChange={(event) =>
                  setMeta((prev) => ({
                    ...prev,
                    scopeCompanyId: event.target.value,
                    scopeSiteId: "",
                    scopeFacilityId: ""
                  }))
                }
              />
              <Select
                options={[{ value: "", label: t("ai.meta.scopeSite") }, ...siteOptions]}
                value={meta.scopeSiteId}
                onChange={(event) =>
                  setMeta((prev) => ({
                    ...prev,
                    scopeSiteId: event.target.value,
                    scopeFacilityId: ""
                  }))
                }
              />
            </div>
            <Select
              options={[{ value: "", label: t("ai.meta.scopeFacility") }, ...facilityOptions]}
              value={meta.scopeFacilityId}
              onChange={(event) =>
                setMeta((prev) => ({ ...prev, scopeFacilityId: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="formSection">
          <h3 className="sectionTitle">{t("ai.obligations.title")}</h3>
          {obligations.length ? (
            <div className="timeline">
              {obligations.map((obligation) => {
                const hasError = invalidObligationIds.has(obligation.id);
                return (
                  <div key={obligation.id} className="formSection">
                    <div className="sectionHeader">
                      <label className="checkboxRow">
                        <input
                          type="checkbox"
                          checked={obligation.accepted}
                          onChange={(event) =>
                            updateObligation(obligation.id, { accepted: event.target.checked })
                          }
                        />
                        <span>{t("ai.obligations.apply")}</span>
                      </label>
                      <ConfidenceBadge confidence={obligation.confidence} />
                    </div>
                    <div className="inlineFieldRow">
                      <Input
                        value={obligation.title}
                        onChange={(event) =>
                          updateObligation(obligation.id, { title: event.target.value })
                        }
                        placeholder={t("obligations.form.title")}
                      />
                      <Select
                        options={[
                          { value: "MANDATORY", label: t("tasks.level.mandatory") },
                          { value: "RECOMMENDED", label: t("tasks.level.recommended") }
                        ]}
                        value={obligation.dutyLevel ?? "MANDATORY"}
                        onChange={(event) =>
                          updateObligation(obligation.id, {
                            dutyLevel: event.target.value as "MANDATORY" | "RECOMMENDED"
                          })
                        }
                      />
                    </div>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={obligation.longDescription ?? ""}
                      onChange={(event) =>
                        updateObligation(obligation.id, { longDescription: event.target.value })
                      }
                      placeholder={t("obligations.form.infoTextLong")}
                    />
                    <div className="inlineFieldRow">
                      <Select
                        options={[
                          { value: "ONE_TIME", label: t("ai.obligations.scheduling.oneTime") },
                          { value: "RECURRING", label: t("ai.obligations.scheduling.recurring") }
                        ]}
                        value={obligation.scheduling ?? "ONE_TIME"}
                        onChange={(event) =>
                          updateObligation(obligation.id, {
                            scheduling: event.target.value as "ONE_TIME" | "RECURRING"
                          })
                        }
                      />
                      <Select
                        options={[
                          { value: "MONTHLY", label: t("ai.obligations.interval.monthly") },
                          { value: "QUARTERLY", label: t("ai.obligations.interval.quarterly") },
                          { value: "SEMIANNUAL", label: t("ai.obligations.interval.semiannual") },
                          { value: "ANNUAL", label: t("ai.obligations.interval.annual") },
                          { value: "CUSTOM", label: t("ai.obligations.interval.custom") }
                        ]}
                        value={obligation.interval ?? "ANNUAL"}
                        onChange={(event) =>
                          updateObligation(obligation.id, {
                            interval: event.target.value as AiObligationSuggestion["interval"]
                          })
                        }
                        disabled={obligation.scheduling !== "RECURRING"}
                      />
                    </div>
                    <div className="inlineFieldRow">
                      <Input
                        type="date"
                        value={obligation.firstDueDate ?? ""}
                        onChange={(event) =>
                          updateObligation(obligation.id, { firstDueDate: event.target.value })
                        }
                      />
                      <Input
                        value={obligation.responsibleRoleHint ?? ""}
                        placeholder={t("ai.obligations.responsibleRoleHint")}
                        onChange={(event) =>
                          updateObligation(obligation.id, { responsibleRoleHint: event.target.value })
                        }
                      />
                    </div>
                    <div className="inlineFieldRow">
                      <label className="checkboxRow">
                        <input
                          type="checkbox"
                          checked={Boolean(obligation.evidenceRequirements?.requirePhoto)}
                          onChange={(event) =>
                            updateObligation(obligation.id, {
                              evidenceRequirements: {
                                ...obligation.evidenceRequirements,
                                requirePhoto: event.target.checked
                              }
                            })
                          }
                        />
                        <span>{t("obligations.evidenceRequirements.requirePhoto")}</span>
                      </label>
                      <label className="checkboxRow">
                        <input
                          type="checkbox"
                          checked={Boolean(obligation.evidenceRequirements?.requireDocument)}
                          onChange={(event) =>
                            updateObligation(obligation.id, {
                              evidenceRequirements: {
                                ...obligation.evidenceRequirements,
                                requireDocument: event.target.checked
                              }
                            })
                          }
                        />
                        <span>{t("obligations.evidenceRequirements.requireDocument")}</span>
                      </label>
                    </div>
                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={Boolean(obligation.evidenceRequirements?.requireReport)}
                        onChange={(event) =>
                          updateObligation(obligation.id, {
                            evidenceRequirements: {
                              ...obligation.evidenceRequirements,
                              requireReport: event.target.checked
                            }
                          })
                        }
                      />
                      <span>{t("obligations.evidenceRequirements.requireReport")}</span>
                    </label>
                    <label className="checkboxRow">
                      <input
                        type="checkbox"
                        checked={Boolean(obligation.reminder?.emailEnabled)}
                        onChange={(event) =>
                          updateObligation(obligation.id, {
                            reminder: {
                              emailEnabled: event.target.checked,
                              daysBefore: event.target.checked
                                ? clampReminderDays(obligation.reminder?.daysBefore, 7)
                                : undefined
                            }
                          })
                        }
                      />
                      <span>{t("obligations.form.emailReminderEnable")}</span>
                    </label>
                    {obligation.reminder?.emailEnabled ? (
                      <Input
                        type="number"
                        min="0"
                        max="365"
                        value={String(clampReminderDays(obligation.reminder?.daysBefore, 7))}
                        onChange={(event) =>
                          updateObligation(obligation.id, {
                            reminder: {
                              emailEnabled: true,
                              daysBefore: clampReminderDays(Number(event.target.value), 7)
                            }
                          })
                        }
                      />
                    ) : null}
                    {hasError ? (
                      <span className="validationText">{t("ai.obligations.validation.invalid")}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="placeholderText">{t("ai.obligations.empty")}</p>
          )}
        </div>

        <div className="formSection">
          <h3 className="sectionTitle">{t("ai.deadlines.title")}</h3>
          {deadlines.length ? (
            <div className="timeline">
              {deadlines.map((deadline) => {
                const hasError = invalidDeadlineIds.has(deadline.id);
                const isPast = pastDeadlineIds.has(deadline.id);
                return (
                  <div key={deadline.id} className="formSection">
                    <div className="sectionHeader">
                      <label className="checkboxRow">
                        <input
                          type="checkbox"
                          checked={deadline.accepted}
                          onChange={(event) =>
                            updateDeadline(deadline.id, { accepted: event.target.checked })
                          }
                        />
                        <span>{t("ai.deadlines.apply")}</span>
                      </label>
                      <ConfidenceBadge confidence={deadline.confidence} />
                    </div>
                    <Input
                      value={deadline.title}
                      onChange={(event) =>
                        updateDeadline(deadline.id, { title: event.target.value })
                      }
                      placeholder={t("deadlines.form.title")}
                    />
                    <div className="inlineFieldRow">
                      <Input
                        type="date"
                        value={deadline.dueDate}
                        onChange={(event) =>
                          updateDeadline(deadline.id, { dueDate: event.target.value })
                        }
                      />
                      <Select
                        options={[
                          { value: "LEGAL_DOC", label: t("ai.deadlines.relatedTo.legalDoc") },
                          { value: "PROJECT", label: t("ai.deadlines.relatedTo.project") }
                        ]}
                        value={deadline.relatedTo ?? "LEGAL_DOC"}
                        onChange={(event) =>
                          updateDeadline(deadline.id, {
                            relatedTo: event.target.value as "LEGAL_DOC" | "PROJECT"
                          })
                        }
                      />
                    </div>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={deadline.context ?? ""}
                      onChange={(event) =>
                        updateDeadline(deadline.id, { context: event.target.value })
                      }
                      placeholder={t("deadlines.form.description")}
                    />
                    {hasError ? (
                      <span className="validationText">{t("ai.deadlines.validation.invalid")}</span>
                    ) : null}
                    {isPast ? (
                      <span className="placeholderText">{t("ai.deadlines.validation.past")}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="placeholderText">{t("ai.deadlines.empty")}</p>
          )}
        </div>

        {!canApply ? (
          <div className="validationText">{t("ai.review.validation.fixErrors")}</div>
        ) : null}
      </div>
    </Modal>
  );
}

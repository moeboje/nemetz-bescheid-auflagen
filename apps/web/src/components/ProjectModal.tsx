import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import { useScopes } from "../state/ScopesStore";
import { useAuthorities } from "../state/AuthoritiesStore";
import { useProjects } from "../state/ProjectsStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useAuthorization } from "../state/AuthorizationStore";
import FileUploadStub, { UploadItem } from "./FileUploadStub";
import { ProjectPolicy } from "../policies/ProjectPolicy";
import type { Project } from "../data/projects";
import UserSelect from "./UserSelect";
import UserMultiSelect from "./UserMultiSelect";
import ScopeInlineCreateModal, { ScopeInlineCreateMode } from "./ScopeInlineCreateModal";
import { getProjectStatusOptions } from "../projectStatus";
import { getProjectSubmissionTypeOptions } from "../projectSubmissionType";

type ProjectFormStatus = Project["status"] | "";
type ProjectFormSubmissionType = Project["submissionType"] | "";

const emptyForm = {
  title: "",
  status: "DRAFT" as ProjectFormStatus,
  submissionType: "" as ProjectFormSubmissionType,
  shortDescription: "",
  companyId: "",
  siteId: "",
  facilityId: "",
  authorityId: "",
  authorityContactId: "",
  authorityRef: "",
  ownerUserId: "",
  deputyUserId: "",
  participantUserIds: [] as string[],
  dependsOnProjectIds: [] as string[],
  referenceLegalDocIds: [] as string[],
  attachments: [] as UploadItem[]
};

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function createAttachment(file: File): UploadItem {
  return {
    id: `pa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename: file.name,
    sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
    addedAt: todayStamp()
  };
}

function getParticipantUserIds(project: Project) {
  if (project.internalParticipants?.length) {
    return project.internalParticipants.map((participant) => participant.userId);
  }
  return project.participantUserIds ?? [];
}

function isArchived(value: { isArchived?: boolean; archivedAt?: string }) {
  return Boolean(value.isArchived || value.archivedAt);
}

type ProjectModalProps = {
  open: boolean;
  onClose: () => void;
  project?: Project;
};

export default function ProjectModal({ open, onClose, project }: ProjectModalProps) {
  const { actor } = useAuthorization();
  const { companies, sites, facilities } = useScopes();
  const { authorities, contacts, getContactsForAuthority } = useAuthorities();
  const { legalDocs } = useLegalDocs();
  const { addProject, updateProject, projects, validateDependencyCandidate } = useProjects();
  const [form, setForm] = useState(emptyForm);
  const [inlineCreateOpen, setInlineCreateOpen] = useState(false);
  const [inlineCreateMode, setInlineCreateMode] = useState<ScopeInlineCreateMode | null>(null);
  const [showArchivedRelations, setShowArchivedRelations] = useState(false);
  const [dependencySearch, setDependencySearch] = useState("");
  const [legalRefSearch, setLegalRefSearch] = useState("");
  const [dependencyCandidateId, setDependencyCandidateId] = useState("");
  const [legalRefCandidateId, setLegalRefCandidateId] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setShowArchivedRelations(false);
    setDependencySearch("");
    setLegalRefSearch("");
    setDependencyCandidateId("");
    setLegalRefCandidateId("");

    if (project) {
      setForm({
        title: project.title,
        status: project.status ?? "",
        submissionType: project.submissionType ?? "",
        shortDescription: project.shortDescription ?? "",
        companyId: project.companyId,
        siteId: project.siteId ?? "",
        facilityId: project.facilityId ?? "",
        authorityId: project.authorityId ?? "",
        authorityContactId: project.authorityContactId ?? "",
        authorityRef: project.authorityRef ?? "",
        ownerUserId: project.ownerUserId ?? "",
        deputyUserId: project.deputyUserId ?? "",
        participantUserIds: getParticipantUserIds(project),
        dependsOnProjectIds: project.dependsOnProjectIds ?? [],
        referenceLegalDocIds: project.referenceLegalDocIds ?? [],
        attachments: project.attachments ?? []
      });
      return;
    }
    setForm(emptyForm);
  }, [open, project]);

  useEffect(() => {
    if (open) {
      return;
    }
    setInlineCreateOpen(false);
    setInlineCreateMode(null);
    setShowArchivedRelations(false);
    setDependencySearch("");
    setLegalRefSearch("");
    setDependencyCandidateId("");
    setLegalRefCandidateId("");
  }, [open]);

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

  const companyOptions = useMemo(
    () => activeCompanies.map((company) => ({ value: company.id, label: company.name })),
    [activeCompanies]
  );

  const siteOptions = useMemo(
    () =>
      activeSites
        .filter((site) => site.companyId === form.companyId)
        .map((site) => ({ value: site.id, label: site.name })),
    [activeSites, form.companyId]
  );

  const facilityOptions = useMemo(() => {
    if (!form.companyId || !form.siteId) {
      return [];
    }
    return activeFacilities
      .filter(
        (facility) =>
          facility.companyId === form.companyId && facility.siteId === form.siteId
      )
      .map((facility) => ({ value: facility.id, label: facility.name }));
  }, [activeFacilities, form.companyId, form.siteId]);

  const canCreateSiteInline = Boolean(form.companyId);
  const canCreateFacilityInline = Boolean(form.companyId && form.siteId);

  const siteHint = useMemo(() => {
    if (!form.companyId) {
      return t("projects.inlineCreate.hintSelectCompany");
    }
    if (siteOptions.length === 0) {
      return t("projects.inlineCreate.site.empty");
    }
    return "";
  }, [form.companyId, siteOptions.length]);

  const facilityHint = useMemo(() => {
    if (!form.companyId) {
      return t("projects.inlineCreate.hintSelectCompany");
    }
    if (!form.siteId) {
      return t("projects.inlineCreate.hintSelectSite");
    }
    if (facilityOptions.length === 0) {
      return t("projects.inlineCreate.facility.empty");
    }
    return "";
  }, [facilityOptions.length, form.companyId, form.siteId]);

  const authorityOptions = useMemo(
    () =>
      authorities
        .filter((authority) => !authority.isArchived || authority.id === form.authorityId)
        .map((authority) => ({ value: authority.id, label: authority.name })),
    [authorities, form.authorityId]
  );

  const contactOptions = useMemo(
    () => {
      const baseContacts = getContactsForAuthority(form.authorityId);
      const selectedArchivedContact =
        form.authorityId && form.authorityContactId
          ? contacts.find(
              (contact) =>
                contact.id === form.authorityContactId &&
                contact.authorityId === form.authorityId
            )
          : undefined;

      const mergedContacts =
        selectedArchivedContact &&
        !baseContacts.some((contact) => contact.id === selectedArchivedContact.id)
          ? [...baseContacts, selectedArchivedContact]
          : baseContacts;

      return mergedContacts.map((contact) => ({
        value: contact.id,
        label: contact.name
      }));
    },
    [contacts, form.authorityContactId, form.authorityId, getContactsForAuthority]
  );

  const canSave = project
    ? ProjectPolicy.update(actor, project)
    : ProjectPolicy.create(actor);
  const isSaveDisabled = !canSave || !form.title.trim() || !form.companyId;
  const statusOptions = useMemo(
    () => getProjectStatusOptions({ includeUnset: Boolean(project && !project.status) }),
    [project]
  );
  const submissionTypeOptions = useMemo(
    () =>
      getProjectSubmissionTypeOptions({
        includeUnset: !project || Boolean(project && !project.submissionType)
      }),
    [project]
  );
  const projectById = useMemo(
    () => new Map(projects.map((item) => [item.id, item] as const)),
    [projects]
  );
  const legalDocById = useMemo(
    () => new Map(legalDocs.map((item) => [item.id, item] as const)),
    [legalDocs]
  );

  const dependencyOptionRows = useMemo(() => {
    const query = dependencySearch.trim().toLowerCase();
    return projects
      .filter((candidate) => {
        if (!showArchivedRelations && isArchived(candidate)) {
          return false;
        }
        if (!query) {
          return true;
        }
        return (
          candidate.title.toLowerCase().includes(query) ||
          candidate.id.toLowerCase().includes(query)
        );
      })
      .map((candidate) => {
        let reason: "cycle" | "self" | "duplicate" | undefined;
        const alreadySelected = form.dependsOnProjectIds.includes(candidate.id);

        if (alreadySelected) {
          reason = "duplicate";
        } else if (project) {
          const validation = validateDependencyCandidate(
            project.id,
            candidate.id,
            form.dependsOnProjectIds
          );
          if (!validation.ok && validation.reason === "cycle") {
            reason = "cycle";
          } else if (!validation.ok && validation.reason === "self") {
            reason = "self";
          } else if (!validation.ok && validation.reason === "duplicate") {
            reason = "duplicate";
          }
        }

        const labelParts = [`${candidate.title} (${candidate.id})`];
        if (isArchived(candidate)) {
          labelParts.push(t("users.archived"));
        }
        if (reason === "cycle") {
          labelParts.push(t("projects.modal.relations.cycleBlocked"));
        } else if (reason === "self") {
          labelParts.push(t("projects.modal.relations.selfBlocked"));
        } else if (reason === "duplicate") {
          labelParts.push(t("projects.modal.relations.alreadySelected"));
        }

        return {
          value: candidate.id,
          label: labelParts.join(" • "),
          disabled: Boolean(reason),
          reason
        };
      });
  }, [
    dependencySearch,
    form.dependsOnProjectIds,
    project,
    projects,
    showArchivedRelations,
    validateDependencyCandidate
  ]);

  const legalRefOptionRows = useMemo(() => {
    const query = legalRefSearch.trim().toLowerCase();
    return legalDocs
      .filter((doc) => {
        if (!showArchivedRelations && isArchived(doc)) {
          return false;
        }
        if (!query) {
          return true;
        }
        return doc.title.toLowerCase().includes(query) || doc.id.toLowerCase().includes(query);
      })
      .map((doc) => {
        const alreadySelected = form.referenceLegalDocIds.includes(doc.id);
        const labelParts = [`${doc.title} (${doc.id})`];
        if (isArchived(doc)) {
          labelParts.push(t("users.archived"));
        }
        if (alreadySelected) {
          labelParts.push(t("projects.modal.relations.alreadySelected"));
        }
        return {
          value: doc.id,
          label: labelParts.join(" • "),
          disabled: alreadySelected
        };
      });
  }, [form.referenceLegalDocIds, legalDocs, legalRefSearch, showArchivedRelations]);

  const selectedDependencies = useMemo(
    () =>
      form.dependsOnProjectIds.map((projectId) => {
        const linkedProject = projectById.get(projectId);
        return {
          id: projectId,
          label: linkedProject ? `${linkedProject.title} (${linkedProject.id})` : projectId,
          isArchived: linkedProject ? isArchived(linkedProject) : false
        };
      }),
    [form.dependsOnProjectIds, projectById]
  );

  const selectedLegalRefs = useMemo(
    () =>
      form.referenceLegalDocIds.map((legalDocId) => {
        const linkedDoc = legalDocById.get(legalDocId);
        return {
          id: legalDocId,
          label: linkedDoc ? `${linkedDoc.title} (${linkedDoc.id})` : legalDocId,
          isArchived: linkedDoc ? isArchived(linkedDoc) : false
        };
      }),
    [form.referenceLegalDocIds, legalDocById]
  );

  const selectedDependencyOption = dependencyOptionRows.find(
    (option) => option.value === dependencyCandidateId
  );
  const selectedLegalRefOption = legalRefOptionRows.find(
    (option) => option.value === legalRefCandidateId
  );
  const hasCycleBlockedDependencyOption = dependencyOptionRows.some(
    (option) => option.reason === "cycle"
  );

  useEffect(() => {
    if (
      dependencyCandidateId &&
      !dependencyOptionRows.some(
        (option) => option.value === dependencyCandidateId && !option.disabled
      )
    ) {
      setDependencyCandidateId("");
    }
  }, [dependencyCandidateId, dependencyOptionRows]);

  useEffect(() => {
    if (
      legalRefCandidateId &&
      !legalRefOptionRows.some(
        (option) => option.value === legalRefCandidateId && !option.disabled
      )
    ) {
      setLegalRefCandidateId("");
    }
  }, [legalRefCandidateId, legalRefOptionRows]);

  const openInlineCreate = (mode: ScopeInlineCreateMode) => {
    setInlineCreateMode(mode);
    setInlineCreateOpen(true);
  };

  const closeInlineCreate = () => {
    setInlineCreateOpen(false);
    setInlineCreateMode(null);
  };

  const handleInlineCreated = (result: { siteId?: string; facilityId?: string }) => {
    if (result.siteId) {
      setForm((prev) => ({ ...prev, siteId: result.siteId ?? "", facilityId: "" }));
    }
    if (result.facilityId) {
      setForm((prev) => ({ ...prev, facilityId: result.facilityId ?? "" }));
    }
    closeInlineCreate();
  };

  const handleSave = async () => {
    if (isSaveDisabled) {
      return;
    }

    const internalParticipants = form.participantUserIds.map((userId) => ({ userId }));
    let saveSucceeded = false;

    if (project) {
      saveSucceeded = await updateProject(project.id, {
        title: form.title,
        status: form.status || undefined,
        submissionType: form.submissionType || undefined,
        shortDescription: form.shortDescription,
        companyId: form.companyId,
        siteId: form.siteId || undefined,
        facilityId: form.facilityId || undefined,
        authorityId: form.authorityId || undefined,
        authorityContactId: form.authorityContactId || undefined,
        authorityRef: form.authorityRef,
        ownerUserId: form.ownerUserId || undefined,
        deputyUserId: form.deputyUserId || undefined,
        internalParticipants,
        participantUserIds: internalParticipants.map((participant) => participant.userId),
        dependsOnProjectIds: form.dependsOnProjectIds,
        referenceLegalDocIds: form.referenceLegalDocIds,
        attachments: form.attachments
      });
    } else {
      saveSucceeded = await addProject({
        title: form.title,
        status: form.status || undefined,
        submissionType: form.submissionType || undefined,
        shortDescription: form.shortDescription,
        companyId: form.companyId,
        siteId: form.siteId || undefined,
        facilityId: form.facilityId || undefined,
        authorityId: form.authorityId || undefined,
        authorityContactId: form.authorityContactId || undefined,
        authorityRef: form.authorityRef,
        ownerUserId: form.ownerUserId || undefined,
        deputyUserId: form.deputyUserId || undefined,
        internalParticipants,
        participantUserIds: internalParticipants.map((participant) => participant.userId),
        dependsOnProjectIds: form.dependsOnProjectIds,
        referenceLegalDocIds: form.referenceLegalDocIds,
        attachments: form.attachments
      });
    }

    if (saveSucceeded) {
      onClose();
    }
  };

  const handleAddDependency = () => {
    if (!dependencyCandidateId) {
      return;
    }
    if (form.dependsOnProjectIds.includes(dependencyCandidateId)) {
      setDependencyCandidateId("");
      return;
    }
    if (project) {
      const validation = validateDependencyCandidate(
        project.id,
        dependencyCandidateId,
        form.dependsOnProjectIds
      );
      if (!validation.ok) {
        return;
      }
    }
    setForm((prev) => ({
      ...prev,
      dependsOnProjectIds: [...prev.dependsOnProjectIds, dependencyCandidateId]
    }));
    setDependencyCandidateId("");
  };

  const handleRemoveDependency = (dependencyId: string) => {
    setForm((prev) => ({
      ...prev,
      dependsOnProjectIds: prev.dependsOnProjectIds.filter((item) => item !== dependencyId)
    }));
  };

  const handleAddLegalRef = () => {
    if (!legalRefCandidateId || form.referenceLegalDocIds.includes(legalRefCandidateId)) {
      setLegalRefCandidateId("");
      return;
    }
    setForm((prev) => ({
      ...prev,
      referenceLegalDocIds: [...prev.referenceLegalDocIds, legalRefCandidateId]
    }));
    setLegalRefCandidateId("");
  };

  const handleRemoveLegalRef = (legalDocId: string) => {
    setForm((prev) => ({
      ...prev,
      referenceLegalDocIds: prev.referenceLegalDocIds.filter((item) => item !== legalDocId)
    }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      mobileFullscreen
      header={project ? t("projects.modal.editTitle") : t("projects.modal.title")}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaveDisabled}>
            {t("modal.save")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.title")}</span>
          <Input
            placeholder={t("projects.form.title")}
            value={form.title}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, title: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.status")}</span>
          <Select
            options={statusOptions}
            value={form.status}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                status: event.target.value as ProjectFormStatus
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.submissionType")}</span>
          <Select
            options={submissionTypeOptions}
            value={form.submissionType}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                submissionType: event.target.value as ProjectFormSubmissionType
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.shortDescription")}</span>
          <Input
            placeholder={t("projects.form.shortDescription")}
            value={form.shortDescription}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, shortDescription: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.company")}</span>
          <Select
            options={[{ value: "", label: t("projects.form.company") }, ...companyOptions]}
            value={form.companyId}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                companyId: event.target.value,
                siteId: "",
                facilityId: ""
              }))
            }
          />
        </div>
        <div className="formField">
          <div className="formFieldHeader">
            <span className="fieldLabel">{t("projects.form.site")}</span>
            <Button
              size="sm"
              variant="ghost"
              className="fieldActionButton"
              disabled={!canCreateSiteInline}
              onClick={() => openInlineCreate("SITE")}
            >
              {t("projects.inlineCreate.site.add")}
            </Button>
          </div>
          <Select
            options={[{ value: "", label: t("projects.form.site") }, ...siteOptions]}
            value={form.siteId}
            disabled={!form.companyId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, siteId: event.target.value, facilityId: "" }))
            }
          />
          {siteHint ? <span className="placeholderText">{siteHint}</span> : null}
        </div>
        <div className="formField">
          <div className="formFieldHeader">
            <span className="fieldLabel">{t("projects.form.facility")}</span>
            <Button
              size="sm"
              variant="ghost"
              className="fieldActionButton"
              disabled={!canCreateFacilityInline}
              onClick={() => openInlineCreate("FACILITY")}
            >
              {t("projects.inlineCreate.facility.add")}
            </Button>
          </div>
          <Select
            options={[{ value: "", label: t("projects.form.facility") }, ...facilityOptions]}
            value={form.facilityId}
            disabled={!form.companyId || !form.siteId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, facilityId: event.target.value }))
            }
          />
          {facilityHint ? <span className="placeholderText">{facilityHint}</span> : null}
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.authority")}</span>
          <Select
            options={[{ value: "", label: t("projects.form.authority") }, ...authorityOptions]}
            value={form.authorityId}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                authorityId: event.target.value,
                authorityContactId: ""
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.authorityContact")}</span>
          <Select
            options={[
              { value: "", label: t("projects.form.authorityContact") },
              ...contactOptions
            ]}
            value={form.authorityContactId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, authorityContactId: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.authorityRef")}</span>
          <Input
            placeholder={t("projects.form.authorityRef")}
            value={form.authorityRef}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, authorityRef: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.owner")}</span>
          <UserSelect
            value={form.ownerUserId || null}
            includeExternal
            allowArchivedCurrentValue
            placeholderKey="projects.owner"
            onChange={(userId) =>
              setForm((prev) => ({ ...prev, ownerUserId: userId ?? "" }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.deputy")}</span>
          <UserSelect
            value={form.deputyUserId || null}
            includeExternal
            allowArchivedCurrentValue
            placeholderKey="projects.deputy"
            onChange={(userId) =>
              setForm((prev) => ({ ...prev, deputyUserId: userId ?? "" }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.participants")}</span>
          <UserMultiSelect
            value={form.participantUserIds}
            includeExternal
            allowArchivedCurrentValue
            showSearch
            onChange={(next) => setForm((prev) => ({ ...prev, participantUserIds: next }))}
          />
        </div>
        <div className="formSection">
          <h3 className="sectionTitle">{t("projects.modal.relations.title")}</h3>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={showArchivedRelations}
              disabled={!canSave}
              onChange={(event) => setShowArchivedRelations(event.target.checked)}
            />
            <span>{t("projects.modal.relations.archivedToggle")}</span>
          </label>
          <div className="formField">
            <span className="fieldLabel">{t("projects.modal.dependsOn.label")}</span>
            <Input
              placeholder={t("projects.modal.relations.searchProjects")}
              disabled={!canSave}
              value={dependencySearch}
              onChange={(event) => setDependencySearch(event.target.value)}
            />
            <div className="relationPickerRow">
              <Select
                options={[
                  { value: "", label: t("projects.modal.relations.selectProject") },
                  ...dependencyOptionRows
                ]}
                disabled={!canSave}
                value={dependencyCandidateId}
                onChange={(event) => setDependencyCandidateId(event.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  !canSave || !dependencyCandidateId || Boolean(selectedDependencyOption?.disabled)
                }
                onClick={handleAddDependency}
              >
                {t("projects.modal.relations.add")}
              </Button>
            </div>
            {hasCycleBlockedDependencyOption ? (
              <span className="placeholderText">{t("projects.modal.relations.cycleBlocked")}</span>
            ) : null}
            <div className="relationSelectionList">
              {selectedDependencies.length ? (
                selectedDependencies.map((row) => (
                  <div key={row.id} className="relationSelectionItem">
                    <div className="relationSelectionMeta">
                      <span className="relationSelectionLabel">{row.label}</span>
                      {row.isArchived ? (
                        <Badge variant="warning">{t("users.archived")}</Badge>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canSave}
                      onClick={() => handleRemoveDependency(row.id)}
                    >
                      {t("common.remove")}
                    </Button>
                  </div>
                ))
              ) : (
                <span className="placeholderText">{t("projects.relations.empty.dependsOn")}</span>
              )}
            </div>
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("projects.modal.legalRefs.label")}</span>
            <Input
              placeholder={t("projects.modal.relations.searchLegalDocs")}
              disabled={!canSave}
              value={legalRefSearch}
              onChange={(event) => setLegalRefSearch(event.target.value)}
            />
            <div className="relationPickerRow">
              <Select
                options={[
                  { value: "", label: t("projects.modal.relations.selectLegalDoc") },
                  ...legalRefOptionRows
                ]}
                disabled={!canSave}
                value={legalRefCandidateId}
                onChange={(event) => setLegalRefCandidateId(event.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!canSave || !legalRefCandidateId || Boolean(selectedLegalRefOption?.disabled)}
                onClick={handleAddLegalRef}
              >
                {t("projects.modal.relations.add")}
              </Button>
            </div>
            <div className="relationSelectionList">
              {selectedLegalRefs.length ? (
                selectedLegalRefs.map((row) => (
                  <div key={row.id} className="relationSelectionItem">
                    <div className="relationSelectionMeta">
                      <span className="relationSelectionLabel">{row.label}</span>
                      {row.isArchived ? (
                        <Badge variant="warning">{t("users.archived")}</Badge>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canSave}
                      onClick={() => handleRemoveLegalRef(row.id)}
                    >
                      {t("common.remove")}
                    </Button>
                  </div>
                ))
              ) : (
                <span className="placeholderText">{t("projects.relations.empty.legalRefs")}</span>
              )}
            </div>
          </div>
        </div>
        <FileUploadStub
          label={t("projects.form.attachments")}
          selectLabel={t("common.selectFile")}
          removeLabel={t("common.remove")}
          disabled={!canSave}
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
      {inlineCreateOpen && inlineCreateMode ? (
        <ScopeInlineCreateModal
          open={inlineCreateOpen}
          mode={inlineCreateMode}
          companyId={form.companyId}
          siteId={form.siteId || undefined}
          onCancel={closeInlineCreate}
          onCreated={handleInlineCreated}
        />
      ) : null}
    </Modal>
  );
}
